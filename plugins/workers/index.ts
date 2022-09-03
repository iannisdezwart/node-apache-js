import { workerData, parentPort } from 'worker_threads'
import { LogLevel } from '@iannisz/logger'

export interface Req {
	body: ObjectOf<any>
	files: File[]
	hostname: string
	ip: string
	method: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE'
	href: string
	path: string
	protocol: 'http' | 'https'
}

export interface File {
	name: string
	tempPath: string
	size: number
	type: string
}

interface ObjectOf<T> {
	[ keys: string ]: T
}

export const req = workerData.req as Req

export type PostMessage = ResponseMessage | WriteMessage | LogMessage | SetHeaderMessage | SetStatusCodeMessage

export interface ResponseMessage {
	type: 'response'
	body: any
}

export interface WriteMessage {
	type: 'write'
	body: any
}

export interface LogMessage {
	type: 'log'
	level: LogLevel
	message: string
}

export interface SetHeaderMessage {
	type: 'set-header'
	name: string
	value: string
}

export interface SetStatusCodeMessage {
	type: 'set-status-code'
	statusCode: number
}

export class Res {
	statusCode: number

	constructor() {
		this.statusCode = 200
	}

	addHeaders(headers: { [ keys: string ]: string }) {
		for (let name in headers) {
			const value = headers[name]

			parentPort.postMessage({ type: 'set-header', name, value } as SetHeaderMessage)
		}
	}

	writeHead(statusCode: number, headers?: { [ keys: string ]: string }) {
		this.addHeaders(headers)
		this.statusCode = statusCode

		parentPort.postMessage({ type: 'set-status-code', statusCode } as SetStatusCodeMessage)
	}

	write(body: any) {
		parentPort.postMessage({ type: 'write', body } as WriteMessage)
	}

	send(body?: any) {
		parentPort.postMessage({
			type: 'set-status-code',
			statusCode: this.statusCode
		} as SetStatusCodeMessage)

		parentPort.postMessage({ type: 'response', body } as ResponseMessage)
	}
}

export const res = new Res()

export const log = async (level: LogLevel, message: string | Error) => {
	if (message instanceof Error) {
		message = message.stack
	}

	parentPort.postMessage({ type: 'log', level, message } as LogMessage)
}