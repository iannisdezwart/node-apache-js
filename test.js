"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var worker_threads_1 = require("worker_threads");
var http_1 = require("http");
http_1.createServer(function (req, res) {
    var worker = new worker_threads_1.Worker('./test-worker.js');
    worker.on('message', function (msg) {
        if (msg.type == 'chunk') {
            var buffer = Buffer.from(msg.data);
            res.write(buffer);
        }
        else if (msg.type == 'end') {
            res.end();
        }
    });
}).listen(3000);
