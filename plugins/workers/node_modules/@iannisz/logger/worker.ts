import { WorkerData, LogLevel } from './index'
import { parentPort, workerData } from 'worker_threads'
import * as chalk from 'chalk'
import * as fs from 'fs'

const options = workerData as WorkerData

const padWithLeadingZeroes = (str: string, len: number) => {
	return '0'.repeat(Math.max(len - str.length, 0)) + str
}

const getTimestamp = () => {
	const now = new Date()

	const year = now.getFullYear()
	const month = padWithLeadingZeroes(now.getMonth().toString(), 2)
	const date = padWithLeadingZeroes(now.getDate().toString(), 2)

	const hour = padWithLeadingZeroes(now.getHours().toString(), 2)
	const minutes = padWithLeadingZeroes(now.getMinutes().toString(), 2)
	const seconds = padWithLeadingZeroes(now.getSeconds().toString(), 2)
	const milliseconds = padWithLeadingZeroes(now.getMilliseconds().toString(), 3)

	const datePart = chalk.cyan(`${ year }-${ month }-${ date }`)
	const timePart = chalk.magenta(`${ hour }:${ minutes }:${ seconds }.${ milliseconds }`)

	return `${ datePart } ${ timePart }`
}

const logPrefixMap = new Map([
	[ 'i', chalk.green('✔') ],
	[ 'w', chalk.yellow('!') ],
	[ 'e', chalk.red('✗') ],
])

parentPort.on('message', (
	input: {
		level: LogLevel,
		message: string | Error
	} | 'exit'
) => {
	if (input == 'exit') {
		process.exit(0)
	} else {
		const prefix = logPrefixMap.get(input.level)
		const timestamp = getTimestamp()

		if (input.message instanceof Error) {
			// Log the stack as well

			input.message = input.message.stack
		}
	
		const line = `${ prefix } [ ${ timestamp } ]: ${ input.message }`
	
		if (options.console) {
			console.log(line)
		}
	
		if (options.file != null) {
			const lineWithoutColours = line.replace(/\x1b\[[0-9]*m/g, '') + '\n'
	
			fs.appendFileSync(options.file, lineWithoutColours)
		}
	}
})