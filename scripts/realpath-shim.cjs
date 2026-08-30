const fs = require("fs");

const originalRealpathSync = fs.realpathSync;
const originalNative = fs.realpathSync.native;

function safeRealpath(fn) {
  return function patchedRealpath(path, options) {
    try {
      return fn.call(this, path, options);
    } catch (error) {
      if (error && error.code === "EPERM" && String(error.path || "").includes("C:\\Users\\JKRFamily")) {
        return String(path);
      }
      throw error;
    }
  };
}

fs.realpathSync = safeRealpath(originalRealpathSync);
fs.realpathSync.native = safeRealpath(originalNative);
