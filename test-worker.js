"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var worker_threads_1 = require("worker_threads");
var fs = require("fs");
var fileStream = fs.createReadStream('/home/iannis/Documents/626.3KB-image.png');
fileStream.on('data', function (chunk) {
    worker_threads_1.parentPort.postMessage({
        type: 'chunk',
        data: chunk
    });
});
fileStream.on('end', function () {
    worker_threads_1.parentPort.postMessage({
        type: 'end'
    });
});
