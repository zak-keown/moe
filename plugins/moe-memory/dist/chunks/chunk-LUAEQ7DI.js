// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  getDbPath,
  getMemoryDataDir
} from "./chunk-YFLZKW2J.js";
import {
  EMBEDDING_DIMENSIONS
} from "./chunk-NH4NDHAK.js";
import {
  __commonJS,
  __require,
  __toESM
} from "./chunk-XRZM5UX2.js";

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs5) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs5);
      }
      if (!fs5.lutimes) {
        patchLutimes(fs5);
      }
      fs5.chown = chownFix(fs5.chown);
      fs5.fchown = chownFix(fs5.fchown);
      fs5.lchown = chownFix(fs5.lchown);
      fs5.chmod = chmodFix(fs5.chmod);
      fs5.fchmod = chmodFix(fs5.fchmod);
      fs5.lchmod = chmodFix(fs5.lchmod);
      fs5.chownSync = chownFixSync(fs5.chownSync);
      fs5.fchownSync = chownFixSync(fs5.fchownSync);
      fs5.lchownSync = chownFixSync(fs5.lchownSync);
      fs5.chmodSync = chmodFixSync(fs5.chmodSync);
      fs5.fchmodSync = chmodFixSync(fs5.fchmodSync);
      fs5.lchmodSync = chmodFixSync(fs5.lchmodSync);
      fs5.stat = statFix(fs5.stat);
      fs5.fstat = statFix(fs5.fstat);
      fs5.lstat = statFix(fs5.lstat);
      fs5.statSync = statFixSync(fs5.statSync);
      fs5.fstatSync = statFixSync(fs5.fstatSync);
      fs5.lstatSync = statFixSync(fs5.lstatSync);
      if (fs5.chmod && !fs5.lchmod) {
        fs5.lchmod = function(path6, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs5.lchmodSync = function() {
        };
      }
      if (fs5.chown && !fs5.lchown) {
        fs5.lchown = function(path6, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs5.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs5.rename = typeof fs5.rename !== "function" ? fs5.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs5.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs5.rename);
      }
      fs5.read = typeof fs5.read !== "function" ? fs5.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs5, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs5, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs5.read);
      fs5.readSync = typeof fs5.readSync !== "function" ? fs5.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs5, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs5.readSync);
      function patchLchmod(fs6) {
        fs6.lchmod = function(path6, mode, callback) {
          fs6.open(
            path6,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs6.fchmod(fd, mode, function(err2) {
                fs6.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs6.lchmodSync = function(path6, mode) {
          var fd = fs6.openSync(path6, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs6.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs6.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs6.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs6) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs6.futimes) {
          fs6.lutimes = function(path6, at, mt, cb) {
            fs6.open(path6, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs6.futimes(fd, at, mt, function(er2) {
                fs6.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs6.lutimesSync = function(path6, at, mt) {
            var fd = fs6.openSync(path6, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs6.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs6.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs6.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs6.futimes) {
          fs6.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs6.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs5, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs5, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs5, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs5, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs5, target, options, callback) : orig.call(fs5, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs5, target, options) : orig.call(fs5, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs5) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path6, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path6, options);
        Stream.call(this);
        var self = this;
        this.path = path6;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs5.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path6, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path6, options);
        Stream.call(this);
        this.path = path6;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs5.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs5 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = Symbol.for("graceful-fs.queue");
      previousSymbol = Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs5[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs5, queue);
      fs5.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs5, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs5.close);
      fs5.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs5, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs5.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs5[gracefulQueue]);
          __require("assert").equal(fs5[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs5[gracefulQueue]);
    }
    module.exports = patch(clone(fs5));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs5.__patched) {
      module.exports = patch(fs5);
      fs5.__patched = true;
    }
    function patch(fs6) {
      polyfills(fs6);
      fs6.gracefulify = patch;
      fs6.createReadStream = createReadStream;
      fs6.createWriteStream = createWriteStream;
      var fs$readFile = fs6.readFile;
      fs6.readFile = readFile;
      function readFile(path6, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path6, options, cb);
        function go$readFile(path7, options2, cb2, startTime) {
          return fs$readFile(path7, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path7, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs6.writeFile;
      fs6.writeFile = writeFile;
      function writeFile(path6, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path6, data, options, cb);
        function go$writeFile(path7, data2, options2, cb2, startTime) {
          return fs$writeFile(path7, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path7, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs6.appendFile;
      if (fs$appendFile)
        fs6.appendFile = appendFile;
      function appendFile(path6, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path6, data, options, cb);
        function go$appendFile(path7, data2, options2, cb2, startTime) {
          return fs$appendFile(path7, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path7, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs6.copyFile;
      if (fs$copyFile)
        fs6.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs6.readdir;
      fs6.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path6, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path7, options2, cb2, startTime) {
          return fs$readdir(path7, fs$readdirCallback(
            path7,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path7, options2, cb2, startTime) {
          return fs$readdir(path7, options2, fs$readdirCallback(
            path7,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path6, options, cb);
        function fs$readdirCallback(path7, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path7, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs6);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs6.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs6.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs6, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs6, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs6, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs6, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path6, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path6, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path6, options) {
        return new fs6.ReadStream(path6, options);
      }
      function createWriteStream(path6, options) {
        return new fs6.WriteStream(path6, options);
      }
      var fs$open = fs6.open;
      fs6.open = open;
      function open(path6, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path6, flags, mode, cb);
        function go$open(path7, flags2, mode2, cb2, startTime) {
          return fs$open(path7, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path7, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs6;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs5[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs5[gracefulQueue].length; ++i) {
        if (fs5[gracefulQueue][i].length > 2) {
          fs5[gracefulQueue][i][3] = now;
          fs5[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs5[gracefulQueue].length === 0)
        return;
      var elem = fs5[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs5[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js"(exports, module) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(this._errors.length - 1, this._errors.length);
          this._timeouts = this._cachedTimeouts.slice(0);
          timeout = this._timeouts.shift();
        } else {
          return false;
        }
      }
      var self = this;
      var timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js
var require_retry2 = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js"(exports, module) {
    var process2 = global.process;
    var processOk = function(process3) {
      return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
    };
    if (!processOk(process2)) {
      module.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process2.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process2.__signal_exit_emitter__) {
        emitter = process2.__signal_exit_emitter__;
      } else {
        emitter = process2.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process2.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process2.emit = originalProcessEmit;
        process2.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process2.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process2.kill(process2.pid, sig);
          }
        };
      });
      module.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process2.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process2.emit = processEmit;
        process2.reallyExit = processReallyExit;
      };
      module.exports.load = load;
      originalProcessReallyExit = process2.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process2.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        originalProcessReallyExit.call(process2, process2.exitCode);
      };
      originalProcessEmit = process2.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process2.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process2.exitCode, null);
          emit("afterexit", process2.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
    "use strict";
    var cacheSymbol = Symbol();
    function probe(file, fs5, callback) {
      const cachedPrecision = fs5[cacheSymbol];
      if (cachedPrecision) {
        return fs5.stat(file, (err, stat) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs5.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs5.stat(file, (err2, stat) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs5, cacheSymbol, { value: precision });
          callback(null, stat.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module.exports.probe = probe;
    module.exports.getMtime = getMtime;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
    "use strict";
    var path6 = __require("path");
    var fs5 = require_graceful_fs();
    var retry = require_retry2();
    var onExit = require_signal_exit();
    var mtimePrecision = require_mtime_precision();
    var locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath) {
        return callback(null, path6.resolve(file));
      }
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      const lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err) {
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2) {
              options.fs.rmdir(lockfilePath, () => {
              });
              return callback(err2);
            }
            callback(null, mtime, mtimePrecision2);
          });
        }
        if (err.code !== "EEXIST") {
          return callback(err);
        }
        if (options.stale <= 0) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        options.fs.stat(lockfilePath, (err2, stat) => {
          if (err2) {
            if (err2.code === "ENOENT") {
              return acquireLock(file, { ...options, stale: 0 }, callback);
            }
            return callback(err2);
          }
          if (!isLockStale(stat, options)) {
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          }
          removeLock(file, options, (err3) => {
            if (err3) {
              return callback(err3);
            }
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat, options) {
      return stat.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT") {
          return callback(err);
        }
        callback();
      });
    }
    function updateLock(file, options) {
      const lock2 = locks[file];
      if (lock2.updateTimeout) {
        return;
      }
      lock2.updateDelay = lock2.updateDelay || options.update;
      lock2.updateTimeout = setTimeout(() => {
        lock2.updateTimeout = null;
        options.fs.stat(lock2.lockfilePath, (err, stat) => {
          const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
          if (err) {
            if (err.code === "ENOENT" || isOverThreshold) {
              return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1e3;
            return updateLock(file, options);
          }
          const isMtimeOurs = lock2.mtime.getTime() === stat.mtime.getTime();
          if (!isMtimeOurs) {
            return setLockAsCompromised(
              file,
              lock2,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          }
          const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
          options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
            const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
            if (lock2.released) {
              return;
            }
            if (err2) {
              if (err2.code === "ENOENT" || isOverThreshold2) {
                return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
              }
              lock2.updateDelay = 1e3;
              return updateLock(file, options);
            }
            lock2.mtime = mtime;
            lock2.lastUpdate = Date.now();
            lock2.updateDelay = null;
            updateLock(file, options);
          });
        });
      }, lock2.updateDelay);
      if (lock2.updateTimeout.unref) {
        lock2.updateTimeout.unref();
      }
    }
    function setLockAsCompromised(file, lock2, err) {
      lock2.released = true;
      if (lock2.updateTimeout) {
        clearTimeout(lock2.updateTimeout);
      }
      if (locks[file] === lock2) {
        delete locks[file];
      }
      lock2.options.onCompromised(err);
    }
    function lock(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: true,
        retries: 0,
        fs: fs5,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      };
      options.retries = options.retries || 0;
      options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
      options.stale = Math.max(options.stale || 0, 2e3);
      options.update = options.update == null ? options.stale / 2 : options.update || 0;
      options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2)) {
              return;
            }
            if (err2) {
              return callback(operation.mainError());
            }
            const lock2 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options);
            callback(null, (releasedCallback) => {
              if (lock2.released) {
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              }
              unlock(file2, { ...options, realpath: false }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs: fs5,
        realpath: true,
        ...options
      };
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const lock2 = locks[file2];
        if (!lock2) {
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        }
        lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
        lock2.released = true;
        delete locks[file2];
        removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: true,
        fs: fs5,
        ...options
      };
      options.stale = Math.max(options.stale || 0, 2e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        options.fs.stat(getLockFile(file2, options), (err2, stat) => {
          if (err2) {
            return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
          }
          return callback(null, !isLockStale(stat, options));
        });
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.check = check;
    module.exports.getLocks = getLocks;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
    "use strict";
    var fs5 = require_graceful_fs();
    function createSyncFs(fs6) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs6 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs6[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve2, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve2(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs5);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js"(exports, module) {
    "use strict";
    var lockfile2 = require_lockfile();
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock(file, options) {
      const release = await toPromise(lockfile2.lock)(file, options);
      return toPromise(release);
    }
    function lockSync2(file, options) {
      const release = toSync(lockfile2.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile2.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile2.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile2.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile2.check)(file, toSyncOptions(options));
    }
    module.exports = lock;
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.lockSync = lockSync2;
    module.exports.unlockSync = unlockSync;
    module.exports.check = check;
    module.exports.checkSync = checkSync;
  }
});

// src/db.ts
import fs4 from "node:fs";
import path5 from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/database-lease.ts
import fs2 from "node:fs";
import path2 from "node:path";

// src/file-lock.ts
var lockfile = __toESM(require_proper_lockfile(), 1);
import fs from "node:fs";
import path from "node:path";
var DEFAULT_STALE_MS = 10 * 60 * 1e3;
function acquireFileLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.closeSync(fs.openSync(lockPath, "a"));
  let release;
  try {
    release = lockfile.lockSync(lockPath, {
      realpath: false,
      retries: 0,
      stale: DEFAULT_STALE_MS
    });
  } catch (err) {
    if (err?.code === "ELOCKED") return null;
    throw err;
  }
  try {
    fs.writeFileSync(lockPath, String(process.pid), "utf-8");
  } catch {
  }
  return { path: lockPath, release };
}
function releaseFileLock(handle) {
  try {
    handle.release();
  } catch {
  }
  try {
    fs.unlinkSync(handle.path);
  } catch {
  }
}
function readLockHolder(lockPath) {
  try {
    const pid = parseInt(fs.readFileSync(lockPath, "utf-8").trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// src/database-lease.ts
var DatabaseBusyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseBusyError";
  }
};
var LEASE_DIR_SUFFIX = ".leases";
var EPOCH_FILE_SUFFIX = ".epoch";
var WRITER_LOCK_SUFFIX = ".writer.lock";
function leaseDir(dbPath) {
  return dbPath + LEASE_DIR_SUFFIX;
}
function epochFile(dbPath) {
  return dbPath + EPOCH_FILE_SUFFIX;
}
function writerLockPath(dbPath) {
  return dbPath + WRITER_LOCK_SUFFIX;
}
function sharedLockPath(dbPath, id) {
  return path2.join(leaseDir(dbPath), `shared-${id}.lock`);
}
function generateLeaseId() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function readDatabaseEpoch(dbPath) {
  const ep = epochFile(dbPath);
  try {
    const content = fs2.readFileSync(ep, "utf-8").trim();
    const n = parseInt(content, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
function writeDatabaseEpoch(dbPath, epoch) {
  const ep = epochFile(dbPath);
  fs2.mkdirSync(path2.dirname(ep), { recursive: true });
  fs2.writeFileSync(ep, String(epoch), "utf-8");
}
function listSharedLeases(dbPath) {
  const dir = leaseDir(dbPath);
  try {
    return fs2.readdirSync(dir).filter((f) => f.startsWith("shared-") && f.endsWith(".lock"));
  } catch {
    return [];
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function cleanStaleSharedLeases(dbPath) {
  const dir = leaseDir(dbPath);
  for (const file of listSharedLeases(dbPath)) {
    const lockPath = path2.join(dir, file);
    const pid = readLockHolder(lockPath);
    if (pid !== null && !isProcessAlive(pid)) {
      try {
        fs2.unlinkSync(lockPath);
      } catch {
      }
      try {
        fs2.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {
      }
    }
  }
}
function acquireSharedDatabaseLease(dbPath) {
  const dir = leaseDir(dbPath);
  fs2.mkdirSync(dir, { recursive: true });
  const id = generateLeaseId();
  const lockPath = sharedLockPath(dbPath, id);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Failed to acquire shared lease for ${dbPath}`);
  }
  const epoch = readDatabaseEpoch(dbPath);
  let released = false;
  return {
    mode: "shared",
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    }
  };
}
function acquireDatabaseWriter(dbPath, shared) {
  if (shared.mode !== "shared") {
    throw new Error("acquireDatabaseWriter requires a shared lease");
  }
  const lockPath = writerLockPath(dbPath);
  const handle = acquireFileLock(lockPath);
  if (!handle) {
    throw new DatabaseBusyError(`Database writer lock is held by another process for ${dbPath}`);
  }
  const epoch = readDatabaseEpoch(dbPath);
  let released = false;
  return {
    epoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(handle);
    }
  };
}
function withDatabaseWriter(db, expectedEpoch, body) {
  const dbPath = db.__leasePath;
  if (!dbPath) {
    return body();
  }
  const currentEpoch = readDatabaseEpoch(dbPath);
  if (currentEpoch !== expectedEpoch) {
    throw new DatabaseBusyError(
      `Database epoch changed (expected ${expectedEpoch}, got ${currentEpoch}) \u2014 a maintenance operation may have replaced the database`
    );
  }
  return body();
}
function inspectLegacyDatabaseUsers(dbPath) {
  const diagnostics = [];
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";
  const walExists = fs2.existsSync(walPath);
  const shmExists = fs2.existsSync(shmPath);
  if (!walExists && !shmExists) {
    return diagnostics;
  }
  const syncLockPath = path2.join(path2.dirname(dbPath), "sync.lock");
  const syncPid = readLockHolder(syncLockPath);
  if (syncPid !== null && isProcessAlive(syncPid)) {
    diagnostics.push({ pid: syncPid, alive: true });
  }
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const { execSync } = __require("node:child_process");
      const output = execSync(`lsof -t "${dbPath}" 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5e3
      }).trim();
      if (output) {
        for (const line of output.split("\n")) {
          const pid = parseInt(line.trim(), 10);
          if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
            if (!diagnostics.some((d) => d.pid === pid)) {
              diagnostics.push({ pid, alive: isProcessAlive(pid) });
            }
          }
        }
      }
    } catch {
    }
  }
  return diagnostics;
}
function acquireExclusiveMaintenanceLease(dbPath) {
  cleanStaleSharedLeases(dbPath);
  const activeLeases = listSharedLeases(dbPath);
  if (activeLeases.length > 0) {
    const dir = leaseDir(dbPath);
    for (const file of activeLeases) {
      const lockPath = path2.join(dir, file);
      const pid = readLockHolder(lockPath);
      if (pid !== null && isProcessAlive(pid)) {
        throw new DatabaseBusyError(
          `Cannot acquire exclusive maintenance lease: shared lease held by PID ${pid}`
        );
      }
    }
    for (const file of activeLeases) {
      const lockPath = path2.join(dir, file);
      try {
        fs2.unlinkSync(lockPath);
      } catch {
      }
      try {
        fs2.rmSync(lockPath + ".lock", { recursive: true, force: true });
      } catch {
      }
    }
  }
  const legacyUsers = inspectLegacyDatabaseUsers(dbPath);
  const aliveLegacy = legacyUsers.filter((d) => d.alive);
  if (aliveLegacy.length > 0) {
    const pids = aliveLegacy.map((d) => d.pid).join(", ");
    throw new DatabaseBusyError(
      `Cannot acquire exclusive maintenance lease: legacy database users detected (PIDs: ${pids})`
    );
  }
  const writerHandle = acquireFileLock(writerLockPath(dbPath));
  if (!writerHandle) {
    throw new DatabaseBusyError(`Cannot acquire exclusive maintenance lease: writer lock is held`);
  }
  const newEpoch = readDatabaseEpoch(dbPath) + 1;
  writeDatabaseEpoch(dbPath, newEpoch);
  let released = false;
  return {
    mode: "exclusive",
    epoch: newEpoch,
    release() {
      if (released) return;
      released = true;
      releaseFileLock(writerHandle);
    }
  };
}
function assertWritableEpoch(dbPath, expected) {
  const current = readDatabaseEpoch(dbPath);
  if (current !== expected) {
    throw new DatabaseBusyError(
      `Database epoch mismatch (expected ${expected}, got ${current}) \u2014 the database may have been replaced by a maintenance operation`
    );
  }
}

// src/database-transaction.ts
function withTransaction(db, body) {
  db.exec("BEGIN");
  try {
    const value = body();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function withForeignKeysDisabled(db, body) {
  const row = db.prepare("PRAGMA foreign_keys").get();
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    return body();
  } finally {
    db.exec(`PRAGMA foreign_keys = ${row.foreign_keys ? "ON" : "OFF"}`);
  }
}

// src/embedding-migration.ts
import path3 from "node:path";
var EMBEDDING_VERSION = 3;
var acquireMigrationLock = acquireFileLock;
var releaseMigrationLock = releaseFileLock;
function pickStaleBatch(db, limit) {
  return db.prepare(`
    SELECT
      e.id,
      e.user_message,
      e.assistant_message,
      GROUP_CONCAT(DISTINCT tc.tool_name) AS tools
    FROM exchanges e
    LEFT JOIN tool_calls tc ON tc.exchange_id = e.id
    WHERE e.embedding_version < ?
    GROUP BY e.id
    LIMIT ?
  `).all(EMBEDDING_VERSION, limit);
}
function recordReembedded(db, id, embedding) {
  db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(id);
  db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
    id,
    new Uint8Array(new Float32Array(embedding).buffer)
  );
  db.prepare("UPDATE exchanges SET embedding_version = ? WHERE id = ?").run(EMBEDDING_VERSION, id);
}
function countStale(db) {
  const row = db.prepare("SELECT COUNT(*) AS c FROM exchanges WHERE embedding_version < ?").get(EMBEDDING_VERSION);
  return row.c;
}
function getMigrationLockPath(indexDir) {
  return path3.join(indexDir, ".embedding-migration.lock");
}
async function runMigrationBatch(db, indexDir, batchSize, embedFn) {
  const remaining = countStale(db);
  if (remaining === 0) return 0;
  const lockPath = getMigrationLockPath(indexDir);
  const lock = acquireMigrationLock(lockPath);
  if (!lock) {
    console.error(
      `moe-memory: another process is migrating embeddings (${remaining} rows still stale); skipping`
    );
    return 0;
  }
  try {
    const rows = pickStaleBatch(db, batchSize);
    if (rows.length === 0) return 0;
    console.error(`moe-memory: re-embedding batch of ${rows.length} (${remaining} stale total)...`);
    const embeddings = [];
    for (const row of rows) {
      const tools = row.tools ? row.tools.split(",") : void 0;
      const vec = await embedFn(row.user_message, row.assistant_message, tools);
      embeddings.push({ id: row.id, vec });
    }
    withTransaction(db, () => {
      for (const item of embeddings) recordReembedded(db, item.id, item.vec);
    });
    return embeddings.length;
  } finally {
    releaseMigrationLock(lock);
  }
}

// src/native-assets.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { normalize, relative, resolve } from "node:path";
var ALL_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-x64"
];
function loadNativeAssetManifest(root) {
  const manifestPath = resolve(root, "vendor", "sqlite-vec", "manifest.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  if (!raw.targets || typeof raw.targets !== "object") {
    throw new Error(`native asset manifest at ${manifestPath} has no targets`);
  }
  for (const target of ALL_TARGETS) {
    if (!raw.targets[target]) {
      throw new Error(`native asset manifest missing required target: ${target}`);
    }
  }
  return raw;
}
function verifyNativeAsset(root, record) {
  const normalized = normalize(record.path);
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    throw new Error(
      `native asset path escape detected: ${record.path} resolves outside package root`
    );
  }
  const absolutePath = resolve(root, "vendor", "sqlite-vec", normalized);
  const rel = relative(resolve(root, "vendor", "sqlite-vec"), absolutePath);
  if (rel.startsWith("..")) {
    throw new Error(
      `native asset path escape detected: ${record.path} resolves outside vendor directory`
    );
  }
  const content = readFileSync(absolutePath);
  if (content.byteLength !== record.bytes) {
    throw new Error(
      `native asset size mismatch for ${record.target}: expected ${record.bytes}, got ${content.byteLength}`
    );
  }
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== record.sha256) {
    throw new Error(
      `native asset SHA-256 mismatch for ${record.target}: expected ${record.sha256}, got ${sha256}`
    );
  }
  return absolutePath;
}
function resolveNativeAsset(root, platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  const manifest = loadNativeAssetManifest(root);
  const record = manifest.targets[target];
  if (!record) {
    throw new Error(`unsupported sqlite-vec target: ${target}`);
  }
  const absolutePath = verifyNativeAsset(root, record);
  return { record, absolutePath };
}

// src/rollback/state.ts
import fs3 from "node:fs";
import path4 from "node:path";
var VALID_TRANSITIONS = /* @__PURE__ */ new Map([
  ["staging", "fenced"],
  ["fenced", "swapped"]
]);
var RollbackStateError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "RollbackStateError";
  }
};
function rollbackStatePath(dataDir) {
  return path4.join(dataDir, "rollback-state.json");
}
function validateState(raw) {
  if (!raw || typeof raw !== "object") return false;
  const s = raw;
  if (s.schema !== 1) return false;
  if (typeof s.phase !== "string") return false;
  if (!["staging", "fenced", "swapped"].includes(s.phase)) return false;
  if (typeof s.databaseId !== "string" || s.databaseId.length === 0) return false;
  if (typeof s.snapshotSha256 !== "string" || s.snapshotSha256.length !== 64) return false;
  if (typeof s.capsuleSha256 !== "string" || s.capsuleSha256.length !== 64) return false;
  if (typeof s.stagedDatabase !== "string" || s.stagedDatabase.length === 0) return false;
  if (typeof s.retainedV3Database !== "string" || s.retainedV3Database.length === 0) return false;
  if (path4.normalize(s.stagedDatabase).startsWith("..") || path4.isAbsolute(s.stagedDatabase)) {
    return false;
  }
  if (path4.normalize(s.retainedV3Database).startsWith("..") || path4.isAbsolute(s.retainedV3Database)) {
    return false;
  }
  return true;
}
function atomicWriteFile(filePath, content) {
  const dir = path4.dirname(filePath);
  fs3.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  const fd = fs3.openSync(tmpPath, "w");
  try {
    fs3.writeSync(fd, content);
    fs3.fsyncSync(fd);
    fs3.closeSync(fd);
  } catch (err) {
    try {
      fs3.closeSync(fd);
    } catch {
    }
    try {
      fs3.unlinkSync(tmpPath);
    } catch {
    }
    throw err;
  }
  fs3.renameSync(tmpPath, filePath);
  const dirFd = fs3.openSync(dir, "r");
  try {
    fs3.fsyncSync(dirFd);
  } catch {
  } finally {
    fs3.closeSync(dirFd);
  }
}
function readRollbackState(dataDir) {
  const p = rollbackStatePath(dataDir);
  try {
    const content = fs3.readFileSync(p, "utf-8");
    const parsed = JSON.parse(content);
    if (!validateState(parsed)) {
      throw new RollbackStateError("malformed rollback state file", "MALFORMED_STATE");
    }
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
function createRollbackState(dataDir, init) {
  const existing = readRollbackState(dataDir);
  if (existing) {
    throw new RollbackStateError(
      `rollback state already exists in phase "${existing.phase}"`,
      "STATE_EXISTS"
    );
  }
  if (init.phase !== "staging") {
    throw new RollbackStateError(
      `initial rollback state must be "staging", got "${init.phase}"`,
      "INVALID_INITIAL_PHASE"
    );
  }
  const state = { schema: 1, ...init };
  if (!validateState(state)) {
    throw new RollbackStateError("invalid rollback state fields", "INVALID_STATE");
  }
  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(state, null, 2));
  return state;
}
function advanceRollbackState(dataDir, expected, next) {
  const current = readRollbackState(dataDir);
  if (!current) {
    throw new RollbackStateError("no rollback state exists", "NO_STATE");
  }
  if (current.phase !== expected) {
    throw new RollbackStateError(
      `expected phase "${expected}", got "${current.phase}"`,
      "PHASE_MISMATCH"
    );
  }
  const allowed = VALID_TRANSITIONS.get(expected);
  if (allowed !== next) {
    throw new RollbackStateError(
      `invalid transition: "${expected}" -> "${next}"`,
      "INVALID_TRANSITION"
    );
  }
  const updated = { ...current, phase: next };
  atomicWriteFile(rollbackStatePath(dataDir), JSON.stringify(updated, null, 2));
  return updated;
}
function clearRollbackState(dataDir) {
  const current = readRollbackState(dataDir);
  if (current && current.phase === "swapped") {
    throw new RollbackStateError(
      "cannot clear rollback state after swap \u2014 the v3 database has been replaced",
      "CANNOT_CLEAR_AFTER_SWAP"
    );
  }
  const p = rollbackStatePath(dataDir);
  try {
    fs3.unlinkSync(p);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

// src/rollback/fence.ts
var RollbackFencedError = class extends Error {
  constructor() {
    super("rollback is prepared \u2014 all writes are blocked until rollback completes or is aborted");
    this.name = "RollbackFencedError";
  }
};
function assertWritesAllowed(dataDir) {
  const dir = dataDir ?? getMemoryDataDir();
  const state = readRollbackState(dir);
  if (state && state.phase === "fenced") {
    throw new RollbackFencedError();
  }
}

// src/db.ts
var _leases = /* @__PURE__ */ new WeakMap();
var _defaultPackageRoot;
function setDefaultPackageRoot(root) {
  _defaultPackageRoot = root;
}
function getDefaultPackageRoot() {
  return _defaultPackageRoot;
}
function getDatabaseLease(db) {
  return _leases.get(db);
}
function closeDatabase(db) {
  const lease = _leases.get(db);
  if (lease) {
    _leases.delete(db);
    lease.release();
  }
  db.close();
}
function migrateSchema(db) {
  const columns = db.prepare(`SELECT name FROM pragma_table_info('exchanges')`).all();
  const columnNames = new Set(columns.map((c) => c.name));
  const migrations = [
    { name: "last_indexed", sql: "ALTER TABLE exchanges ADD COLUMN last_indexed INTEGER" },
    { name: "parent_uuid", sql: "ALTER TABLE exchanges ADD COLUMN parent_uuid TEXT" },
    {
      name: "is_sidechain",
      sql: "ALTER TABLE exchanges ADD COLUMN is_sidechain BOOLEAN DEFAULT 0"
    },
    {
      name: "harness",
      sql: "ALTER TABLE exchanges ADD COLUMN harness TEXT NOT NULL DEFAULT 'claude'"
    },
    { name: "session_id", sql: "ALTER TABLE exchanges ADD COLUMN session_id TEXT" },
    { name: "cwd", sql: "ALTER TABLE exchanges ADD COLUMN cwd TEXT" },
    { name: "git_branch", sql: "ALTER TABLE exchanges ADD COLUMN git_branch TEXT" },
    { name: "git_commit", sql: "ALTER TABLE exchanges ADD COLUMN git_commit TEXT" },
    { name: "claude_version", sql: "ALTER TABLE exchanges ADD COLUMN claude_version TEXT" },
    { name: "agent_version", sql: "ALTER TABLE exchanges ADD COLUMN agent_version TEXT" },
    { name: "model", sql: "ALTER TABLE exchanges ADD COLUMN model TEXT" },
    { name: "model_provider", sql: "ALTER TABLE exchanges ADD COLUMN model_provider TEXT" },
    { name: "thinking_level", sql: "ALTER TABLE exchanges ADD COLUMN thinking_level TEXT" },
    {
      name: "thinking_disabled",
      sql: "ALTER TABLE exchanges ADD COLUMN thinking_disabled BOOLEAN"
    },
    { name: "thinking_triggers", sql: "ALTER TABLE exchanges ADD COLUMN thinking_triggers TEXT" },
    {
      name: "embedding_version",
      sql: "ALTER TABLE exchanges ADD COLUMN embedding_version INTEGER NOT NULL DEFAULT 0"
    }
  ];
  let migrated = false;
  for (const migration of migrations) {
    if (!columnNames.has(migration.name)) {
      console.log(`Migrating schema: adding ${migration.name} column...`);
      db.prepare(migration.sql).run();
      migrated = true;
    }
  }
  if (migrated) {
    console.log("Migration complete.");
  }
  migrateToolCallsCascade(db);
  migrateJournalRoot(db);
}
function migrateJournalRoot(db) {
  const table = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'`).get();
  if (!table) return;
  const columns = db.prepare(`SELECT name FROM pragma_table_info('journal_entries')`).all();
  if (columns.some((c) => c.name === "root")) return;
  console.log("Migrating journal_entries: adding root column and rebuilding the index...");
  db.prepare("ALTER TABLE journal_entries ADD COLUMN root TEXT NOT NULL DEFAULT ''").run();
  db.prepare("DELETE FROM vec_journal_entries").run();
  db.prepare("DELETE FROM journal_entries").run();
  console.log("  journal index cleared; it rebuilds per project on next index.");
}
function migrateToolCallsCascade(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tool_calls'`).get();
  if (!row) return;
  if (row.sql.toUpperCase().includes("ON DELETE CASCADE")) return;
  console.log("Migrating tool_calls to ON DELETE CASCADE schema...");
  const orphanCount = db.prepare(
    `SELECT COUNT(*) AS c FROM tool_calls
     WHERE exchange_id NOT IN (SELECT id FROM exchanges)`
  ).get().c;
  if (orphanCount > 0) {
    console.log(`  Removing ${orphanCount} orphaned tool_calls row(s)`);
  }
  withForeignKeysDisabled(
    db,
    () => withTransaction(db, () => {
      db.exec(`
      CREATE TABLE tool_calls_new (
        id TEXT PRIMARY KEY,
        exchange_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        tool_result TEXT,
        is_error BOOLEAN DEFAULT 0,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE
      )
    `);
      db.exec(`
      INSERT INTO tool_calls_new
      SELECT id, exchange_id, tool_name, tool_input, tool_result, is_error, timestamp
      FROM tool_calls
      WHERE exchange_id IN (SELECT id FROM exchanges)
    `);
      db.exec(`DROP TABLE tool_calls`);
      db.exec(`ALTER TABLE tool_calls_new RENAME TO tool_calls`);
    })
  );
  console.log("  tool_calls migration complete.");
}
function initDatabase(options) {
  const dbPath = options?.path ?? getDbPath();
  const packageRoot = options?.packageRoot ?? _defaultPackageRoot;
  if (!packageRoot) {
    throw new Error(
      "initDatabase requires a packageRoot \u2014 either pass it in options or call setDefaultPackageRoot() first"
    );
  }
  const dbDir = path5.dirname(dbPath);
  if (!fs4.existsSync(dbDir)) {
    fs4.mkdirSync(dbDir, { recursive: true });
  }
  const lease = acquireSharedDatabaseLease(dbPath);
  const db = new DatabaseSync(dbPath, { allowExtension: true });
  _leases.set(db, lease);
  const asset = resolveNativeAsset(packageRoot);
  db.loadExtension(asset.absolutePath);
  db.enableLoadExtension(false);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      embedding BLOB,
      last_indexed INTEGER,
      parent_uuid TEXT,
      is_sidechain BOOLEAN DEFAULT 0,
      harness TEXT NOT NULL DEFAULT 'claude',
      session_id TEXT,
      cwd TEXT,
      git_branch TEXT,
      git_commit TEXT,
      claude_version TEXT,
      agent_version TEXT,
      model TEXT,
      model_provider TEXT,
      thinking_level TEXT,
      thinking_disabled BOOLEAN,
      thinking_triggers TEXT,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      exchange_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_result TEXT,
      is_error BOOLEAN DEFAULT 0,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_exchanges USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      root TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL,
      sections TEXT NOT NULL,
      source_mtime_ms INTEGER NOT NULL,
      last_indexed INTEGER,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_journal_entries USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      project TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_at TEXT,
      embedding_version INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_nodes USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      created_by TEXT,
      metadata TEXT
    )
  `);
  migrateSchema(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_timestamp ON exchanges(timestamp DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_id ON exchanges(session_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_project ON exchanges(project)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_harness ON exchanges(harness)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sidechain ON exchanges(is_sidechain)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_git_branch ON exchanges(git_branch)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_calls(tool_name)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_exchange ON tool_calls(exchange_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_journal_scope ON journal_entries(scope)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp DESC)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_path ON journal_entries(path)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_edge_source ON memory_edges(source_type, source_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_edge_target ON memory_edges(target_type, target_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_type ON memory_nodes(node_type)
  `);
  return db;
}
function insertExchange(db, exchange, embedding, _toolNames) {
  assertWritesAllowed();
  const now = Date.now();
  const hasEmbedding = embedding !== null && embedding.length > 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO exchanges
    (id, project, timestamp, user_message, assistant_message, archive_path, line_start, line_end, last_indexed,
     parent_uuid, is_sidechain, harness, session_id, cwd, git_branch, git_commit, claude_version, agent_version, model, model_provider,
     thinking_level, thinking_disabled, thinking_triggers, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    exchange.id,
    exchange.project,
    exchange.timestamp,
    exchange.userMessage,
    exchange.assistantMessage,
    exchange.archivePath,
    exchange.lineStart,
    exchange.lineEnd,
    now,
    exchange.parentUuid || null,
    exchange.isSidechain ? 1 : 0,
    exchange.harness || "claude",
    exchange.sessionId || null,
    exchange.cwd || null,
    exchange.gitBranch || null,
    exchange.gitCommit || null,
    exchange.claudeVersion || null,
    exchange.agentVersion || exchange.claudeVersion || null,
    exchange.model || null,
    exchange.modelProvider || null,
    exchange.thinkingLevel || null,
    exchange.thinkingDisabled ? 1 : 0,
    exchange.thinkingTriggers || null,
    hasEmbedding ? EMBEDDING_VERSION : 0
  );
  db.prepare("DELETE FROM vec_exchanges WHERE id = ?").run(exchange.id);
  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_exchanges (id, embedding) VALUES (?, ?)").run(
      exchange.id,
      new Uint8Array(new Float32Array(embedding).buffer)
    );
  }
  if (exchange.toolCalls && exchange.toolCalls.length > 0) {
    const toolStmt = db.prepare(`
      INSERT OR REPLACE INTO tool_calls
      (id, exchange_id, tool_name, tool_input, tool_result, is_error, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const toolCall of exchange.toolCalls) {
      toolStmt.run(
        toolCall.id,
        toolCall.exchangeId,
        toolCall.toolName,
        toolCall.toolInput ? JSON.stringify(toolCall.toolInput) : null,
        toolCall.toolResult || null,
        toolCall.isError ? 1 : 0,
        toolCall.timestamp
      );
    }
  }
}
function getAllExchanges(db) {
  const stmt = db.prepare(`SELECT id, archive_path as archivePath FROM exchanges`);
  return stmt.all();
}
function getFileLastIndexed(db, archivePath) {
  const stmt = db.prepare(`
    SELECT MAX(last_indexed) as lastIndexed
    FROM exchanges
    WHERE archive_path = ?
  `);
  const row = stmt.get(archivePath);
  return row.lastIndexed;
}
function deleteExchange(db, id) {
  assertWritesAllowed();
  db.prepare(`DELETE FROM vec_exchanges WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM exchanges WHERE id = ?`).run(id);
}
function journalEntryFromRow(row) {
  let sections = [];
  try {
    const parsed = JSON.parse(row.sections);
    if (Array.isArray(parsed)) sections = parsed.filter((s) => typeof s === "string");
  } catch {
  }
  return {
    id: row.id,
    path: row.path,
    root: row.root ?? "",
    scope: row.scope === "project" ? "project" : "user",
    timestamp: row.timestamp,
    text: row.text,
    sections
  };
}
var JOURNAL_SELECT_COLUMNS = `
        j.id,
        j.path,
        j.root,
        j.scope,
        j.timestamp,
        j.text,
        j.sections`;
function upsertJournalEntry(db, entry, sourceMtimeMs, embedding = null) {
  assertWritesAllowed();
  const hasEmbedding = embedding !== null && embedding.length > 0;
  db.prepare(`
    INSERT OR REPLACE INTO journal_entries
      (id, path, root, scope, timestamp, text, sections, source_mtime_ms, last_indexed, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.path,
    entry.root,
    entry.scope,
    entry.timestamp,
    entry.text,
    JSON.stringify(entry.sections),
    sourceMtimeMs,
    Date.now(),
    hasEmbedding ? EMBEDDING_VERSION : 0
  );
  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(entry.id);
  if (hasEmbedding) {
    db.prepare("INSERT INTO vec_journal_entries (id, embedding) VALUES (?, ?)").run(
      entry.id,
      new Uint8Array(new Float32Array(embedding).buffer)
    );
  }
}
function deleteJournalEntry(db, id) {
  assertWritesAllowed();
  db.prepare("DELETE FROM vec_journal_entries WHERE id = ?").run(id);
  db.prepare("DELETE FROM journal_entries WHERE id = ?").run(id);
}
function getJournalIndexState(db, scope) {
  const rows = scope ? db.prepare(
    "SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries WHERE scope = ?"
  ).all(scope) : db.prepare("SELECT id, path, root, source_mtime_ms, embedding_version FROM journal_entries").all();
  const state = /* @__PURE__ */ new Map();
  for (const row of rows) {
    state.set(row.id, {
      id: row.id,
      path: row.path,
      root: row.root ?? "",
      sourceMtimeMs: row.source_mtime_ms,
      embeddingVersion: row.embedding_version
    });
  }
  return state;
}
function countJournalEntries(db, scope) {
  const row = scope ? db.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE scope = ?").get(scope) : db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get();
  return row.c;
}
function insertNode(db, node) {
  assertWritesAllowed();
  db.prepare(`
    INSERT OR REPLACE INTO memory_nodes
      (id, node_type, project, content, created_at, superseded_at, embedding_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    node.id,
    node.nodeType,
    node.project ?? null,
    node.content,
    node.createdAt,
    node.supersededAt ?? null,
    node.embeddingVersion
  );
}
function insertEdge(db, edge) {
  assertWritesAllowed();
  db.prepare(`
    INSERT OR REPLACE INTO memory_edges
      (id, source_type, source_id, target_type, target_id, relation, confidence, created_at, created_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    edge.id,
    edge.sourceType,
    edge.sourceId,
    edge.targetType,
    edge.targetId,
    edge.relation,
    edge.confidence,
    edge.createdAt,
    edge.createdBy,
    edge.metadata ? JSON.stringify(edge.metadata) : null
  );
}
function nodeFromRow(row) {
  return {
    id: row.id,
    nodeType: row.node_type,
    project: row.project ?? void 0,
    content: row.content,
    createdAt: row.created_at,
    supersededAt: row.superseded_at ?? void 0,
    embeddingVersion: row.embedding_version
  };
}
function getNode(db, id) {
  const row = db.prepare("SELECT * FROM memory_nodes WHERE id = ?").get(id);
  return row ? nodeFromRow(row) : null;
}
function edgeFromRow(row) {
  let metadata;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
    }
  }
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relation: row.relation,
    confidence: row.confidence,
    createdAt: row.created_at,
    createdBy: row.created_by ?? "system",
    metadata
  };
}
function getEdgesFrom(db, sourceType, sourceId) {
  const rows = db.prepare("SELECT * FROM memory_edges WHERE source_type = ? AND source_id = ?").all(sourceType, sourceId);
  return rows.map(edgeFromRow);
}
function getEdgesTo(db, targetType, targetId) {
  const rows = db.prepare("SELECT * FROM memory_edges WHERE target_type = ? AND target_id = ?").all(targetType, targetId);
  return rows.map(edgeFromRow);
}
function traceProvenance(db, type, id, depth, direction) {
  const results = [];
  const visited = /* @__PURE__ */ new Set();
  let frontier = [[type, id, 0]];
  while (frontier.length > 0) {
    const next = [];
    for (const [curType, curId, curDepth] of frontier) {
      if (curDepth >= depth) continue;
      const edges = direction === "causes" ? getEdgesTo(db, curType, curId) : getEdgesFrom(db, curType, curId);
      for (const edge of edges) {
        if (visited.has(edge.id)) continue;
        visited.add(edge.id);
        results.push({ depth: curDepth + 1, edge });
        const nextType = direction === "causes" ? edge.sourceType : edge.targetType;
        const nextId = direction === "causes" ? edge.sourceId : edge.targetId;
        next.push([nextType, nextId, curDepth + 1]);
      }
    }
    frontier = next;
  }
  return results;
}

export {
  acquireFileLock,
  releaseFileLock,
  readLockHolder,
  DatabaseBusyError,
  readDatabaseEpoch,
  acquireSharedDatabaseLease,
  acquireDatabaseWriter,
  withDatabaseWriter,
  inspectLegacyDatabaseUsers,
  acquireExclusiveMaintenanceLease,
  assertWritableEpoch,
  withTransaction,
  withForeignKeysDisabled,
  EMBEDDING_VERSION,
  countStale,
  runMigrationBatch,
  resolveNativeAsset,
  RollbackStateError,
  readRollbackState,
  createRollbackState,
  advanceRollbackState,
  clearRollbackState,
  assertWritesAllowed,
  setDefaultPackageRoot,
  getDefaultPackageRoot,
  getDatabaseLease,
  closeDatabase,
  migrateSchema,
  migrateJournalRoot,
  migrateToolCallsCascade,
  initDatabase,
  insertExchange,
  getAllExchanges,
  getFileLastIndexed,
  deleteExchange,
  journalEntryFromRow,
  JOURNAL_SELECT_COLUMNS,
  upsertJournalEntry,
  deleteJournalEntry,
  getJournalIndexState,
  countJournalEntries,
  insertNode,
  insertEdge,
  getNode,
  getEdgesFrom,
  getEdgesTo,
  traceProvenance
};
