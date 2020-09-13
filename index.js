"use strict";
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
var fs = require("fs");
var path_1 = require("path");
var http = require("http");
var formidable_1 = require("formidable");
var url_1 = require("url");
var util = require("util");
var mime = require("mime-types");
var chalk = require("chalk");
var logger_1 = require("@iannisz/logger");
var worker_threads_1 = require("worker_threads");
exports.startServer = function (port) {
    /* ===================
        1. Common functions
    =================== */
    var _a, _b;
    var fsExists = util.promisify(fs.exists);
    var fsStats = util.promisify(fs.lstat);
    var fsDeleteFile = util.promisify(fs.unlink);
    var parseJSONFile = function (path) {
        if (!fs.existsSync(path)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(path, 'utf-8'));
    };
    var vhosts = (_a = parseJSONFile('./vhosts.json')) !== null && _a !== void 0 ? _a : {};
    var extenstionBlacklist = (_b = parseJSONFile('./extension-blacklist.json')) !== null && _b !== void 0 ? _b : [
        '.node.js', '.node.ts'
    ];
    var fileAllowed = function (path) {
        for (var _i = 0, extenstionBlacklist_1 = extenstionBlacklist; _i < extenstionBlacklist_1.length; _i++) {
            var extension = extenstionBlacklist_1[_i];
            if (path.endsWith(extension)) {
                return false;
            }
        }
        return true;
    };
    // Send File
    var sendFile = function (req, res, filePath) { return __awaiter(void 0, void 0, void 0, function () {
        var stats, mimeLookup, mimeType, range, start, end, _a, reqStart, reqEnd, readStream;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, fsStats(filePath)];
                case 1:
                    stats = _b.sent();
                    mimeLookup = mime.lookup(filePath);
                    mimeType = (mimeLookup == false) ? '' : mimeLookup;
                    range = req.headers.range;
                    start = 0;
                    end = stats.size - 1;
                    if (range) {
                        _a = range
                            .replace(/bytes=/, '')
                            .split('-')
                            .map(function (el) { return parseInt(el); }), reqStart = _a[0], reqEnd = _a[1];
                        start = isNaN(reqStart) ? 0 : reqStart;
                        end = isNaN(reqEnd) ? stats.size - 1 : reqEnd;
                    }
                    if (start < 0)
                        start = 0;
                    if (end < 0)
                        end = 0;
                    if (range) {
                        if (start >= stats.size || end >= stats.size) {
                            // Send 416 Range Not Satisfiable
                            res.writeHead(416, {
                                'Content-Range': "bytes */" + stats.size
                            });
                            res.write('Range Not Satisfiable');
                            return [2 /*return*/, res.end()];
                        }
                        // Send Partial Content Success
                        res.writeHead(206, {
                            'Content-Range': "bytes " + start + "-" + end + "/" + stats.size,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': end - start + 1,
                            'Content-Type': mimeType
                        });
                    }
                    else {
                        res.writeHead(200, {
                            'Content-Type': mimeType,
                            'Content-Length': stats.size
                        });
                    }
                    readStream = fs.createReadStream(filePath, { start: start, end: end });
                    readStream.pipe(res);
                    return [2 /*return*/];
            }
        });
    }); };
    // Parse form
    var parseForm = function (req) { return new Promise(function (resolve, reject) {
        var form = new formidable_1.IncomingForm();
        form.parse(req, function (err, fields, fileList) {
            if (err) {
                reject();
                return;
            }
            var body = JSON.parse(fields.body);
            var files = [];
            for (var fileName in fileList) {
                var file = fileList[fileName];
                files.push({
                    name: fileName,
                    lastModified: file.lastModifiedDate.getTime(),
                    size: file.size,
                    tempPath: file.path,
                    type: file.type
                });
            }
            resolve({ body: body, files: files });
        });
    }); };
    // Get Host Settings
    var getHostSettings = function (host) {
        if (!(host in vhosts)) {
            return null;
        }
        return __assign({
            filemanager: false,
            error403document: null,
            error404document: null,
        }, vhosts[host]);
    };
    // Send HTTP error functions
    var send404 = function (req, res, hostSettings, logMessage) {
        if (hostSettings.error404document != null) {
            sendFile(req, res, hostSettings.root + hostSettings.error404document);
        }
        else {
            res.writeHead(404);
            res.end('Not Found');
        }
        logger_1.log('w', logMessage);
    };
    var send403 = function (req, res, hostSettings, logMessage) {
        if (hostSettings.error403document != null) {
            sendFile(req, res, hostSettings.root + hostSettings.error403document);
        }
        else {
            res.writeHead(403);
            res.end('Forbidden');
        }
        logger_1.log('w', logMessage);
    };
    var send500 = function (res, logMessage) {
        res.writeHead(500);
        res.end('Internal Server Error');
        logger_1.log('w', logMessage);
    };
    /* ===================
        2. Request handler
    =================== */
    var numOfRequests = 0;
    var requestListener = function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
        var ip_1, url_2, host_1, path_2, id_1, hostSettings, file, exists, stats, finalFile, finalFileExists, file_1, exists, stats, _a, body_1, files_2, WorkerError, runWorker, _i, files_1, uploadedFile, err_1, errorString, err_2;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 21, , 22]);
                    ip_1 = (_b = req.headers.ip) !== null && _b !== void 0 ? _b : req.socket.remoteAddress.replace(/::ffff:/, '');
                    url_2 = new url_1.URL(req.url, "https://" + req.headers.host);
                    host_1 = req.headers.host.replace('www.', '');
                    path_2 = decodeURI(url_2.pathname);
                    id_1 = ++numOfRequests;
                    logger_1.log('i', req.method + " request " + chalk.grey(id_1) + ": from " + chalk.cyan(ip_1) + " to " + chalk.cyan(host_1 + path_2));
                    hostSettings = getHostSettings(host_1);
                    if (hostSettings == null) {
                        logger_1.log('w', chalk.grey(id_1) + ": Unkown host '" + host_1 + "'. Sent status 404");
                        res.writeHead(404);
                        res.end('Not Found');
                        return [2 /*return*/];
                    }
                    if (!(req.method == 'GET')) return [3 /*break*/, 8];
                    file = path_1.resolve(hostSettings.root + path_2);
                    return [4 /*yield*/, fsExists(file)];
                case 1:
                    exists = _c.sent();
                    if (!exists) return [3 /*break*/, 6];
                    return [4 /*yield*/, fsStats(file)];
                case 2:
                    stats = _c.sent();
                    if (!stats.isDirectory()) return [3 /*break*/, 4];
                    finalFile = file + '/index.html';
                    return [4 /*yield*/, fsExists(finalFile)];
                case 3:
                    finalFileExists = _c.sent();
                    if (finalFileExists) {
                        // path + '/index.html' is a file, send it
                        sendFile(req, res, finalFile);
                    }
                    else {
                        // path + '/index.html' does not exist, send 404
                        send404(req, res, hostSettings, chalk.grey(id_1) + ": " + chalk.red(path_2) + " not found. Sent 404");
                    }
                    return [3 /*break*/, 5];
                case 4:
                    // Requested path is a file, check if it's allowed to be sent
                    if (fileAllowed(file)) {
                        sendFile(req, res, file);
                    }
                    else {
                        send403(req, res, hostSettings, chalk.grey(id_1) + ": " + chalk.red(path_2) + " isn't allowed to be sent. Sent 403");
                    }
                    _c.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    send404(req, res, hostSettings, chalk.grey(id_1) + ": " + chalk.red(path_2) + " not found. Sent 404");
                    _c.label = 7;
                case 7: return [3 /*break*/, 20];
                case 8:
                    if (!(req.method == 'POST')) return [3 /*break*/, 19];
                    file_1 = hostSettings.root + path_2;
                    return [4 /*yield*/, fsExists(file_1)];
                case 9:
                    exists = _c.sent();
                    if (!exists) return [3 /*break*/, 18];
                    return [4 /*yield*/, fsStats(file_1)];
                case 10:
                    stats = _c.sent();
                    if (!stats.isDirectory()) return [3 /*break*/, 11];
                    send404(req, res, hostSettings, chalk.grey(id_1) + ": " + chalk.red(path_2) + " is a directory. Sent 404");
                    return [3 /*break*/, 18];
                case 11:
                    if (!file_1.endsWith('.node.js')) return [3 /*break*/, 17];
                    return [4 /*yield*/, parseForm(req)];
                case 12:
                    _a = _c.sent(), body_1 = _a.body, files_2 = _a.files;
                    console.log(body_1, files_2);
                    WorkerError = void 0;
                    (function (WorkerError) {
                        WorkerError[WorkerError["None"] = 0] = "None";
                        WorkerError[WorkerError["NoResponse"] = 1] = "NoResponse";
                        WorkerError[WorkerError["Unspecified"] = 2] = "Unspecified";
                    })(WorkerError || (WorkerError = {}));
                    runWorker = function () { return new Promise(function (resolve, reject) { return __awaiter(void 0, void 0, void 0, function () {
                        var worker, convertBody;
                        return __generator(this, function (_a) {
                            // Spawn worker
                            logger_1.log('i', chalk.grey(id_1) + ": Spawned Node Worker: " + chalk.cyan(file_1));
                            worker = new worker_threads_1.Worker(file_1, {
                                workerData: {
                                    req: {
                                        body: body_1,
                                        files: files_2,
                                        hostname: host_1,
                                        ip: ip_1,
                                        method: req.method,
                                        href: url_2.href,
                                        path: path_2,
                                        protocol: url_2.protocol
                                    }
                                }
                            });
                            convertBody = function (message) {
                                if (message.type == 'response' || message.type == 'write') {
                                    if (message.body instanceof Uint8Array) {
                                        message.body = Buffer.from(message.body);
                                    }
                                    else if (message.body instanceof Object) {
                                        message.body = JSON.stringify(message.body);
                                    }
                                }
                                return message;
                            };
                            worker.on('message', function (message) {
                                console.log(message);
                                try {
                                    convertBody(message);
                                    if (message.type == 'response') {
                                        if (res.writableEnded) {
                                            logger_1.log('e', new Error("Worker tried to end the request after it had been sent.").stack);
                                        }
                                        else {
                                            res.end(message.body);
                                            resolve();
                                        }
                                    }
                                    else if (message.type == 'write') {
                                        if (res.writableEnded) {
                                            logger_1.log('e', new Error("Worker tried to write after end.").stack);
                                        }
                                        else {
                                            res.write(message.body);
                                        }
                                    }
                                    else if (message.type == 'set-header') {
                                        if (res.headersSent) {
                                            logger_1.log('e', new Error("Worker tried to set a header after they were sent.").stack);
                                        }
                                        else {
                                            res.setHeader(message.name, message.value);
                                        }
                                    }
                                    else if (message.type == 'set-status-code') {
                                        if (!res.headersSent && !res.writableEnded) {
                                            res.statusCode = message.statusCode;
                                        }
                                    }
                                    else if (message.type == 'log') {
                                        logger_1.log(message.level, message.message);
                                    }
                                }
                                catch (err) {
                                    logger_1.log('e', chalk.grey(id_1) + ": Main thread failed to execute worker message: " + JSON.stringify(message, null, 2));
                                }
                            });
                            worker.on('error', function (err) {
                                if (err != undefined) {
                                    logger_1.log('e', chalk.grey(id_1) + ": Worker encountered an error: " + err.stack);
                                }
                                else {
                                    logger_1.log('e', chalk.grey(id_1) + ": Worker sent empty error.");
                                }
                            });
                            worker.on('exit', function (code) {
                                if (code == 0) {
                                    reject(WorkerError.NoResponse);
                                }
                                else {
                                    reject(WorkerError.Unspecified);
                                }
                            });
                            return [2 /*return*/];
                        });
                    }); }); };
                    _c.label = 13;
                case 13:
                    _c.trys.push([13, 15, , 16]);
                    return [4 /*yield*/, runWorker()
                        // Delete uploaded files from temp path
                    ];
                case 14:
                    _c.sent();
                    // Delete uploaded files from temp path
                    for (_i = 0, files_1 = files_2; _i < files_1.length; _i++) {
                        uploadedFile = files_1[_i];
                        fsDeleteFile(uploadedFile.tempPath);
                    }
                    return [3 /*break*/, 16];
                case 15:
                    err_1 = _c.sent();
                    errorString = (err_1.stack != undefined) ? err_1.stack : err_1;
                    send500(res, chalk.grey(id_1) + ": Node Worker exited with an error: " + chalk.red(errorString) + ". Sent 500");
                    return [3 /*break*/, 16];
                case 16: return [3 /*break*/, 18];
                case 17:
                    // File cannot be excecuted
                    send404(req, res, hostSettings, chalk.grey(id_1) + ": " + chalk.red(file_1) + " cannot be executed. Sent 404");
                    _c.label = 18;
                case 18: return [3 /*break*/, 20];
                case 19:
                    logger_1.log('w', chalk.grey(id_1) + ": Method " + chalk.magenta(req.method) + " is not handled.");
                    _c.label = 20;
                case 20: return [3 /*break*/, 22];
                case 21:
                    err_2 = _c.sent();
                    res.writeHead(500);
                    res.end('Internal Server Error');
                    logger_1.log('e', chalk.red(err_2));
                    return [3 /*break*/, 22];
                case 22: return [2 /*return*/];
            }
        });
    }); };
    /* ===================
        3. Server startup
    =================== */
    // Start logging
    logger_1.startLogger({
        console: true,
        file: 'server.log'
    });
    // Create server
    var server = http.createServer(requestListener);
    // Start server
    server.listen(port, function () {
        logger_1.log('i', "Server started. Listening on port " + port);
    });
    // Store server start time
    var serverStartTime = Date.now();
    server.on('close', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.log('i', "Server was closed programmatically");
                    return [4 /*yield*/, logger_1.stopLogger()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    /* ===================
        4. On exit
    =================== */
    var gatherStatistics = function () {
        var now = Date.now();
        var runningTime = now - serverStartTime;
        var requestsPerSecond = numOfRequests / (runningTime / 1000);
        var requestsPerMinute = requestsPerSecond * 60;
        return "Server statistics:\n==================\n\nUptime: " + chalk.cyan(runningTime / 1000) + "s\nRequests served: " + chalk.cyan(numOfRequests) + "\n\nRequests per second: " + chalk.cyan(requestsPerSecond.toFixed(2)) + "\nRequests per minute: " + chalk.cyan(requestsPerMinute.toFixed(2));
    };
    process.on('exit', function (code) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.log((code == 0) ? 'i' : 'e', "Server exited with exit code " + code);
                    return [4 /*yield*/, logger_1.stopLogger()];
                case 1:
                    _a.sent();
                    server.close();
                    return [2 /*return*/];
            }
        });
    }); });
    process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log(gatherStatistics());
                    logger_1.log('i', "Server terminated due to SIGINT");
                    return [4 /*yield*/, logger_1.stopLogger()];
                case 1:
                    _a.sent();
                    server.close();
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    }); });
    return server;
};
