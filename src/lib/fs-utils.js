import Promise from 'bluebird';
import path, { sep } from 'path';
import readline from 'readline';
import fs from 'fs';
import _ from 'lodash';
import os from 'os';

Promise.promisifyAll(fs);

// ##############
// FILE HELPERS #
// ##############

// async wrapper
export async function writeFile(to, data, encoding = 'utf8') {
  await fs.writeFileAsync(to, data, encoding);
}

// async read of file line by line, returns Array of lines
export async function getFileLines(dir, filename) {

  if (!_.isString(dir) || !_.isString(filename)) {
    throw new Error('[Utils.getFileLines] dir and filename must be Strings');
  }

  const from = path.join(dir, filename);
  return new Promise((resolve, reject) => {

    const allLines = [];

    readline.createInterface({
      input: fs.createReadStream(from),
      console: false,
    })
      .on('error', reject)
      .on('line', (line) => allLines.push(line))
      .on('close', () => resolve(allLines))
    ;
  });
}

// #############
// DIR HELPERS #
// #############


// Creates a unique temporary directory.
export async function createTmpDir() {

  // os specific tmp dir
  const tmpDir = os.tmpdir();

  // Generates six random characters to be appended behind a required prefix
  return await fs.mkdtempAsync(`${tmpDir}${sep}`);
}

export async function deepLs(from, paths = []) {

  paths.push(from);
  const ls = await exports.ls(from);
  const lsDir = await exports.lsDir(from, ls);

  _.forEach(ls, (path) => {

    const file = `${from}/${path}`;
    if (_.includes(lsDir, path)) {
      return;
    }

    paths.push(file);
  });

  await Promise.map(lsDir, async(path) => {
    await exports.deepLs(`${from}/${path}`, paths);
  });

  return paths;
}

// check if given path (from) points to a directory
// returns true || false
export async function exists(from) {

  if (!_.isString(from)) {
    throw new Error('[Utils.exists] from must be String');
  }

  let stat;
  try {
    stat = await fs.lstatAsync(from);
  } catch (e) {
    return null;
  }

  return stat;
}


// check if given path (from) points to a directory
// returns true || false
export async function isDir(from) {

  if (!_.isString(from)) {
    throw new Error('[Utils.isDir] from must be String');
  }

  const stat = await fs.lstatAsync(from);
  const isDir = stat.isDirectory();

  return isDir;
}

// list all item in a folder
// returns Array of file names
export async function ls(from) {

  let files;
  try {
    files = await fs.readdirAsync(from);
  } catch (e) {
    console.log(e);
  }

  return files || [];
}

// list all folder in a given folder
// returns Array of folder names
export async function lsDir(from) {
  // list all items in a given directory
  const all = await exports.ls(from);
  // returns folder name or false for each item
  let directories = await Promise.map(all, async(item) => {

    const check = path.join(from, item);
    let isDir = false;
    try {
      isDir = await exports.isDir(check);
    } catch (e) {
      console.log('lsDir error', error);
    }

    return isDir && item;
  });

  // remove falsy values
  directories = _.compact(directories);
  return directories;
}

// check if folder is empty returns boolean
export async function hasFiles(from) {
  const inner = await exports.ls(from);
  const bool = Boolean(_.size(inner));
  return bool;
}

// check if foler is empty but does not take into account index.js file
export async function hasFilesSkipIndex(from) {
  const inner = await exports.ls(from);
  const noIndex = _.without(inner, 'index.js');
  const bool = Boolean(_.size(noIndex));
  return bool;
}

export default {
  writeFile,
  createTmpDir,
  getFileLines,
  isDir,
  ls,
  lsDir,
  deepLs,
  hasFiles,
  hasFilesSkipIndex,
};
