import { Worker } from 'worker_threads'
import { createServer } from 'http'

createServer((req, res) => {
	const worker = new Worker('./test-worker.js')
	
	worker.on('message', msg => {
		if (msg.type == 'chunk') {
			const buffer = Buffer.from(msg.data)
			res.write(buffer)
		} else if (msg.type == 'end') {
			res.end()
		}
	})
}).listen(3000)
