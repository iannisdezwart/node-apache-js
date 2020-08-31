import { parentPort } from 'worker_threads'
import * as fs from 'fs'

const fileStream = fs.createReadStream('/home/iannis/Documents/626.3KB-image.png')

fileStream.on('data', chunk => {
	parentPort.postMessage({
		type: 'chunk',
		data: chunk
	})
})

fileStream.on('end', () => {
	parentPort.postMessage({
		type: 'end'
	})
})
