/* 

	===== Info about this file =====

	" This is the main TS/JS file for ApacheJS

	Author: Iannis de Zwart (https://github.com/iannisdezwart)

	===== Table of contents =====

	1. Common functions

	2. Request handler

	3. Server startup

	4. On exit
*/

import * as fs from 'fs'
import { resolve as resolvePath } from 'path'

import * as http from 'http'
import { IncomingForm } from 'formidable'
import { createProxyServer } from 'http-proxy'
import { URL, URLSearchParams } from 'url'

import * as util from 'util'
import * as mime from 'mime-types'

import * as chalk from 'chalk'
import { log, startLogger, stopLogger } from '@iannisz/logger'

import { Worker } from 'worker_threads'
import { PostMessage } from './plugins/workers/index'

interface HostSettings {
	root: string
	proxyPort: number
	redirect: string
	filemanager: boolean
	error403document: string
	error404document: string
	overrideHeaders: { [ key: string ]: string }
}

interface VHostsFile {
	[ hostName: string ]: HostSettings
}

interface File {
	name: string
	tempPath: string
	lastModified: number
	size: number
	type: string
}

export const startServer = (
	port: number
) => {
	/* ===================
		1. Common functions
	=================== */

	const fsExists = util.promisify(fs.exists)
	const fsStats = util.promisify(fs.lstat)
	const fsDeleteFile = util.promisify(fs.unlink)

	const proxy = createProxyServer()

	const parseJSONFile = (path: string) => {
		if (!fs.existsSync(path)) {
			return null
		}

		return JSON.parse(fs.readFileSync(path, 'utf-8'))
	}

	const vhosts = parseJSONFile('./vhosts.json') ?? {} as VHostsFile
	const extenstionBlacklist = parseJSONFile('./extension-blacklist.json') ?? [
		'.node.js', '.node.ts'
	] as string[]

	const fileAllowed = (path: string) => {
		for (let extension of extenstionBlacklist) {
			if (path.endsWith(extension)) {
				return false
			}
		}

		return true
	}

	// Send File

	const sendFile = async (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: URL,
		filePath: string
	) => {
		const stats = await fsStats(filePath)
		const mimeLookup = mime.lookup(filePath)
		const mimeType = (mimeLookup == false) ? '' : mimeLookup

		const range = req.headers.range
		let start = 0
		let end = stats.size - 1

		if (range) {
			const [ reqStart, reqEnd ] = range
				.replace(/bytes=/, '')
				.split('-')
				.map(el => parseInt(el))

			start = isNaN(reqStart) ? 0 : reqStart
			end = isNaN(reqEnd) ? stats.size - 1 : reqEnd
		}

		if (start < 0) start = 0
		if (end < 0) end = 0

		if (range) {
			if (start >= stats.size || end >= stats.size) {
				// Send 416 Range Not Satisfiable

				res.writeHead(416, {
					'Content-Range': `bytes */${ stats.size }`
				})

				res.write('Range Not Satisfiable')
				return res.end()
			}

			// Send Partial Content Success

			res.statusCode = 206

			res.setHeader('Content-Range', `bytes ${ start }-${ end }/${ stats.size }`)
			res.setHeader('Accept-Ranges', `bytes`)
			res.setHeader('Content-Type', mimeType)
			res.setHeader('Content-Length', end - start + 1)
		} else {
			res.statusCode = 200

			res.setHeader('Content-Type', mimeType)
			res.setHeader('Content-Length', stats.size)
		}

		// Check caching request

		const urlSearchParams = new URLSearchParams(url.search)
		const cacheAge = urlSearchParams.get('cache-age')

		if (cacheAge != null) {
			res.setHeader('Cache-Control', `public, max-age=${ cacheAge }, immutable`)
		}

		// Stream to response

		const readStream = fs.createReadStream(filePath, { start, end })
		readStream.pipe(res)
	}

	// Parse form

	const parseForm = (
		req: http.IncomingMessage
	) => new Promise<{ body: any, files: File[] }>((resolve, reject) => {
		const form = new IncomingForm()

		form.parse(req, (err, fields, fileList) => {
			if (err) {
				reject()
				return
			}

			let body: any

			try {
				body = JSON.parse(fields.body as string)
			} catch {
				body = {}
			}

			const files: File[] = []

			for (let fileName in fileList) {
				const file = fileList[fileName]

				files.push({
					name: fileName,
					lastModified: file.lastModifiedDate.getTime(),
					size: file.size,
					tempPath: file.path,
					type: file.type
				})
			}

			resolve({ body, files })
		})
	})

	// Get Host Settings

	const getHostSettings = (
		host: string
	) => {
		if (!(host in vhosts)) {
			return null
		}

		return {
			...{
				filemanager: false,
				error403document: null,
				error404document: null,
			},
			...vhosts[host]
		} as HostSettings
	}

	// Send HTTP error functions

	const send404 = (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: URL,
		hostSettings: HostSettings,
		logMessage: string
	) => {
		if (hostSettings.error404document != null) {
			sendFile(req, res, url, hostSettings.root + hostSettings.error404document)
		} else {
			res.writeHead(404)
			res.end('Not Found')
		}

		log('w', logMessage)
	}

	const send403 = (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: URL,
		hostSettings: HostSettings,
		logMessage: string
	) => {
		if (hostSettings.error403document != null) {
			sendFile(req, res, url, hostSettings.root + hostSettings.error403document)
		} else {
			res.writeHead(403)
			res.end('Forbidden')
		}

		log('w', logMessage)
	}

	const send500 = (
		res: http.ServerResponse,
		logMessage: string
	) => {
		res.writeHead(500)
		res.end('Internal Server Error')

		log('w', logMessage)
	}

	/* ===================
		2. Request handler
	=================== */

	let numOfRequests = 0

	const requestListener = async (
		req: http.IncomingMessage,
		res: http.ServerResponse
	) => {
		try {
			const ip = req.headers['cf-connecting-ip'] // CloudFlare Proxy
				?? req.headers['x-forwarded-for'] // Other Proxy
				?? req.headers.ip // Actual IP Header
				?? req.socket.remoteAddress.replace(/::ffff:/, '') // From Socket

			const url = new URL(req.url, `https://${ req.headers.host }`)
			const host = req.headers.host.replace('www.', '')
			const path = decodeURI(url.pathname)
			const id = ++numOfRequests

			log('i', `${ req.method } request ${ chalk.grey(id) }: from ${ chalk.cyan(ip) } to ${ chalk.cyan(host + path) }`)

			const hostSettings = getHostSettings(host)

			if (hostSettings == null) {
				log('w', `${ chalk.grey(id) }: Unkown host '${ host }'. Sent status 404`)

				res.writeHead(404)
				res.end('Not Found')

				return
			}

			if (hostSettings.overrideHeaders != null) {
				for (const header in hostSettings.overrideHeaders) {
					const value = hostSettings.overrideHeaders[header]
					res.setHeader(header, value)
				}
			}

			if (hostSettings.redirect != null) {
				log('i', `${ chalk.grey(id) }: Redirected request to ${ hostSettings.redirect }`)

				res.setHeader('location', hostSettings.redirect)
				res.writeHead(301)
				res.end()

				return
			}

			if (hostSettings.proxyPort != null) {
				// Send the request to the proxy server

				log('i', `${ chalk.grey(id) }: Proxied request to localhost:${ hostSettings.proxyPort }`)

				proxy.web(req, res, {
					target: {
						host: 'localhost', port: hostSettings.proxyPort
					}
				}, err => {
					log('e', `Proxy error: ${ err.message }`)
					res.writeHead(502)
					res.end('Proxy error')
				})

				return
			}

			if (req.method == 'GET') {
				// Send file

				const file = resolvePath(hostSettings.root + path)

				const exists = await fsExists(file)

				if (exists) {
					const stats = await fsStats(file)

					if (stats.isDirectory()) {
						// Auto index.html concatenation

						let finalFile = file + '/index.html'

						// Check if path + '/index.html' exists

						const finalFileExists = await fsExists(finalFile)

						if (finalFileExists) {
							// path + '/index.html' is a file, send it

							sendFile(req, res, url, finalFile)
						} else {
							// path + '/index.html' does not exist, send 404

							send404(req, res, url, hostSettings, `${ chalk.grey(id) }: ${ chalk.red(path) } not found. Sent 404`)
						}
					} else {
						// Requested path is a file, check if it's allowed to be sent

						if (fileAllowed(file)) {
							sendFile(req, res, url, file)
						} else {
							send403(req, res, url, hostSettings, `${ chalk.grey(id) }: ${ chalk.red(path) } isn't allowed to be sent. Sent 403`)
						}
					}
				} else {
					send404(req, res, url, hostSettings, `${ chalk.grey(id) }: ${ chalk.red(path) } not found. Sent 404`)
				}
			} else if (req.method == 'POST') {
				// Find file

				let file = hostSettings.root + path

				const exists = await fsExists(file)

				if (exists) {
					const stats = await fsStats(file)

					if (stats.isDirectory()) {
						send404(req, res, url, hostSettings, `${ chalk.grey(id) }: ${ chalk.red(path) } is a directory. Sent 404`)
					} else {
						// Requested path is a file, try to execute it

						if (file.endsWith('.node.js')) {
							// Parse the request

							const { body, files } = await parseForm(req)
							console.log(body, files)

							enum WorkerError {
								None = 0,
								NoResponse = 1,
								Unspecified = 2
							}

							const runWorker = () => new Promise<void>(async (resolve, reject) => {

								// Spawn worker

								log('i', `${ chalk.grey(id) }: Spawned Node Worker: ${ chalk.cyan(file) }`)

								// Todo: update this

								const worker = new Worker(file, {
									workerData: {
										req: {
											body,
											files,
											hostname: host,
											ip,
											method: req.method,
											href: url.href,
											path,
											protocol: url.protocol
										}
									}
								})

								const convertBody = (message: PostMessage) => {
									if (message.type == 'response' || message.type == 'write') {
										if (message.body instanceof Uint8Array) {
											message.body = Buffer.from(message.body)
										} else if (message.body instanceof Object) {
											message.body = JSON.stringify(message.body)
										}
									}

									return message
								}

								worker.on('message', (message: PostMessage) => {
									console.log(message)

									try {
										convertBody(message)

										if (message.type == 'response') {

											if (res.writableEnded) {
												log('e', new Error(`Worker tried to end the request after it had been sent.`).stack)
											} else {
												res.end(message.body)
												resolve()
											}

										} else if (message.type == 'write') {

											if (res.writableEnded) {
												log('e', new Error(`Worker tried to write after end.`).stack)
											} else {
												res.write(message.body)
											}

										} else if (message.type == 'set-header') {

											if (res.headersSent) {
												log('e', new Error(`Worker tried to set a header after they were sent.`).stack)
											} else {
												res.setHeader(message.name, message.value)
											}

										} else if (message.type == 'set-status-code') {

											if (!res.headersSent && !res.writableEnded) {
												res.statusCode = message.statusCode
											}

										} else if (message.type == 'log') {

											log(message.level, message.message)

										}
									} catch(err) {
										log('e', `${ chalk.grey(id) }: Main thread failed to execute worker message: ${ JSON.stringify(message, null, 2) }`)
									}
								})

								worker.on('error', err => {
									if (err != undefined) {
										log('e', `${ chalk.grey(id) }: Worker encountered an error: ${ err.stack }`)
									} else {
										log('e', `${ chalk.grey(id) }: Worker sent empty error.`)
									}
								})

								worker.on('exit', code => {
									if (code == 0) {
										reject(WorkerError.NoResponse)
									} else {
										reject(WorkerError.Unspecified)
									}
								})
							})

							try {
								await runWorker()

								// Delete uploaded files from temp path

								for (let uploadedFile of files) {
									fsDeleteFile(uploadedFile.tempPath)
								}
							} catch(err) {
								// Worker encountered an error

								const errorString = (err.stack != undefined) ? err.stack : err

								send500(res, `${ chalk.grey(id) }: Node Worker exited with an error: ${ chalk.red(errorString) }. Sent 500`)
							}
						} else {
							// File cannot be excecuted

							send404(req, res, url, hostSettings,  `${ chalk.grey(id) }: ${ chalk.red(file) } cannot be executed. Sent 404`)
						}
					}
				}
			} else {
				log('w', `${ chalk.grey(id) }: Method ${ chalk.magenta(req.method) } is not handled.`)

				// Ignore the request
			}
		} catch(err) {
			res.writeHead(500)
			res.end('Internal Server Error')

			log('e', chalk.red(err))
		}
	}

	/* ===================
		3. Server startup
	=================== */

	// Start logging

	startLogger({
		console: true,
		file: 'server.log'
	})

	// Create server

	const server = http.createServer(requestListener)

	// Start server

	server.listen(port, () => {
		log('i', `Server started. Listening on port ${ port }`)
	})

	// Store server start time

	const serverStartTime = Date.now()

	server.on('close', async () => {
		log('i', `Server was closed programmatically`)

		await stopLogger()
	})


	/* ===================
		4. On exit
	=================== */

	const gatherStatistics = () => {
		const now = Date.now()
		const runningTime = now - serverStartTime

		const requestsPerSecond = numOfRequests / (runningTime / 1000)
		const requestsPerMinute = requestsPerSecond * 60

		return `\
Server statistics:
==================

Uptime: ${ chalk.cyan(runningTime / 1000) }s
Requests served: ${ chalk.cyan(numOfRequests) }

Requests per second: ${ chalk.cyan(requestsPerSecond.toFixed(2)) }
Requests per minute: ${ chalk.cyan(requestsPerMinute.toFixed(2)) }`
	}

	process.on('exit', async code => {
		log((code == 0) ? 'i' : 'e', `Server exited with exit code ${ code }`)

		await stopLogger()
		server.close()
	})

	process.on('SIGINT', async () => {
		console.log(gatherStatistics())
		log('i', `Server terminated due to SIGINT`)

		await stopLogger()
		server.close()
		process.exit(0)
	})

	return server
}
