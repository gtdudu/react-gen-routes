import Promise from 'bluebird';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import debug from 'debug'

import fsu from './fs-utils';
import stru from './str-utils';
import tmplu from './tmpl-utils';
import getCode from './babel';


const logger = debug('rgr');

class Engine {

  constructor(options = {}) {

    const optsOk = _.isString(options.inputDir) &&
      _.isString(options.outputDir) &&
      _.isString(options.filename) &&
      (
        _.isUndefined(options.templatesDir) ||
        _.isString(options.templatesDir)
      ) &&
      _.isBoolean(options.watch)
    ;

    if (!optsOk) {
      throw new Error('[Engine.constructor] invalid options.');
    }


    this._keywords = options.keywords;
    // this._parseComponent = options.ba
    // coma separated list of accepted extensions or undefined
    this._extensions = options.extensions;
    // folder that we need to analyse
    this._inputDir = options.inputDir;
    // folder where we want to write routes file
    this._outputDir = options.outputDir;
    // name of the output routes file
    this._filename = options.filename;
    // folder holding component and imports template
    this._templatesDir = options.templatesDir;
    // true to recompute routes file on inputDir changes
    this._watch = options.watch;

    // necessary to properly sort routes
    this._parentDirInfo = {
      isDynamicDir: false,
      isNestedDir: false,
      hasDynamicFile: false,
    };

    this._cache = {};
  }

  setExtentions(){

    if (!this._extensions) {
      this._extensions = ['js'];
      return;
    }

    const extensions = _.split(this._extensions, ',');
    const trimed = _.map(_.compact(extensions), (ext) => {
      return _.trim(ext);
    });
    this._extensions = trimed;
  }

  setKeywords() {

    if (!this._keywords) {
      this._keywords = [];
      return;
    }

    const keywords = _.split(this._keywords, ',');
    const trimed = _.map(_.compact(keywords), (word) => {
      return _.trim(word);
    });

    this._keywords = trimed;
    this._shouldParse = _.size(trimed);
  }

  async safeRun() {

    try {
      await this.run();
      logger('All good: routes.js has been generated');
    } catch (e) {
      logger('engine failed to run', e);
    }
  }

  async run() {

    // get accepted files extensions
    this.setExtentions();
    this.setKeywords();

    // create uniq temporary directory
    this._tmpFolder = await fsu.createTmpDir();

    // get relative path between outputDir and inputDir
    this._relativePath = path.relative(this._outputDir, this._inputDir);

    // compute routes file
    const routes = await this.getAllRoutes(this._inputDir);

    // write json file to tmp dir
    const jsonRoutesPath = path.join(this._tmpFolder, 'routes.js');
    await fsu.writeFile(jsonRoutesPath, JSON.stringify(routes, null, 2));

    // compute js file from json file
    const routesFile = await tmplu.fillRoutesTemplate(this._tmpFolder, this._templatesDir);

    // write js file to outputDir
    const outputPath = path.join(this._outputDir, this._filename);
    await fsu.writeFile(outputPath, routesFile);

    // run is over, ready to run again
    this.ready = true;

    // return if watch mode is off
    if (!this._watch) {
      // watch mode is off
      return;
    }

    // if we're not already watching for changes in inputDir, start watch
    if (!this.watching) {
      await this.watchDir();
      logger('Watching for changes...');
    }

    // nothing changed while we were running, return
    if (!this.shouldRerun) {
      return;
    }

    // we received a change event while we were already runing, start over
    logger('DEBUG: run is over but got event in the meantime! re running');
    this.shouldRerun = false;
    await this.run();
  }

  handleCache(type, cmpPath) {

    if (!this._shouldParse) {
      return;
    }

    const absolutePath = path.resolve('.', cmpPath);

    if (type === 'unlink' || type === 'change') {
      delete this._cache[absolutePath];
    }
  }

  async watchDir() {

    // input dir must be a String path that points to a folder
    if (!_.isString(this._inputDir) || !fsu.isDir(this._inputDir)) {
      throw new Error('[watch] {inputDir} does not point to a directory');
    }

    try {
      // recursively get the list of all files in inputDir
      const list = await fsu.deepLs(this._inputDir);
      const size = _.size(list);
      // chokidar will emit 'add' events when starting the watch
      const chokidar = require('chokidar');
      // since we already generate routes on startup do not relaunch unless counter is equal to initial list size
      let counter = 0;

      this.watching = true;
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        chokidar.watch(this._inputDir) // start watch
          .on('all', async(event, path) => {

            counter++;
            // init is not over
            if (counter < size) {
              return;
            }

            if (this._resolve) {
              const resolve = this._resolve;
              this._resolve = null;
              return resolve();
            }

            this.handleCache(event, path);
            logger(`[watch] '${event}' => ${path}`);

            // make sure we're not ready to run again if we catch another events
            if (!this.ready) {
              this.shouldRerun = true;
              return;
            }

            this.ready = false;
            await this.run();
            logger('# routes.js has been regenerated');
          })
        ;
      })
    } catch (err) {
      logger('[watch]: ', err);
    }
  }

  async getAllRoutes(from) {

    const routesConfig = {};

    // make sure from points to a directory
    const isDir = await fsu.isDir(from);

    if (!isDir) {
      throw new Error('from is not a directory');
    }

    const routes = await this.getRoutes(from, this._parentDirInfo);
    routesConfig.routes = routes;

    return routesConfig;
  }

  // given a directory path and a list of filenames in it
  // returns Array<Object> { name, isDir, filePath }
  // sorted with files first and folder second
  // fileNames that do not match component convention (1 dot) or that do not have an extension listed in _extensions won't be returned
  async sortAndFilter(from, names) {

    const files = [];
    const folders = [];
    await Promise.each(names, async(name) => {

      const filePath = path.join(from, name);
      const isDir = await fsu.isDir(filePath);

      if (isDir) {
        folders.push({ name, isDir, filePath });
        return;
      }

      // keep only filenames that point to components:
      // - need to end in '.js'
      // - need to have only 1 dot
      // a.js -> cmp
      // a.style.js, a.whatever.js, ... -> not cmp
      // TODO: find a way not to impose those rules...
      // maybe pass a regex as args ?
      // or a path to a function ?
      // should at least be able to select extension
      const splitted = _.split(name, '.');
      if (_.size(splitted) !== 2 ||
      !_.includes(this._extensions, _.last(splitted))) {
        return;
      }

      files.push({ name, isDir, filePath });
    });

    return [...files, ...folders];
  }

  hasNested(items, nameNoExt) {

    const exist = _.find(items, (check) => {
      return check.name === nameNoExt;
    });
    return Boolean(exist);
  }

  isNested(items, nameNoExt) {

    const name = nameNoExt + '.js';
    const exist = _.find(items, (check) => {
      return check.name === name;
    });
    return Boolean(exist);
  }

  // scores (from 1 to 5) will be needed for sorting later on
  // beware, this function mutates items
  getSortScore(items, parentDirInfo) {

    _.each(items, (item) => {

      // index file in dynamic directory need to be push last
      if (item.nameNoExt === 'index' && parentDirInfo.isDynamicDir) {
        item.score = 5;
        return;
      }

      // all other index file need to be pushed first
      if (item.nameNoExt === 'index') {
        item.score = 1;
        return;
      }

      // non dynamic file should be right after index files
      if (!item.isDynamic && !item.isDir) {
        item.score = 2;
        return;
      }

      // non dynamic folders come after index and non dynamic files
      if (!item.isDynamic) {
        item.score = 3;
        return;
      }

      // dynamic folders must be one to last
      if (item.isDir) {
        item.score = 4;
        return;
      }

      // dynamic file need to be last
      // this does not conflict with index files in a dynamic folder since we cannot have both at the same time
      item.score = 5;
    });
  }

  async getInfo(from, parentDirInfo, items) {

    // track how many dynamic files and folders we find
    let dynamicFolderCount = 0;
    let dynamicFileCount = 0;
    let dynamicIndexDir = false;

    // remove _inputDir from parent folder path
    // handle _inputDir starting with './'
    // used to compute relative path between _outputDir and items
    const cleanInput = from
      .replace(this._inputDir, '')
      .replace(this._inputDir.slice(2), '')
    ;

    // compute infos
    const infos = await Promise.map(items, async (item) => {

      const d = { ...item };

      // folder base info
      if (item.isDir) {
        d.nameNoExt = item.name;
        d.isNested = this.isNested(_.without(items, item), d.nameNoExt);
        dynamicIndexDir = d.isNested && d.nameNoExt === 'index';
      }

      // file base info
      if (!item.isDir) {
        d.nameNoExt = stru.stripExtension(item.name);
        d.hasNested = this.hasNested(_.without(items, item), d.nameNoExt);
        d.routePath = await stru.createRoutePath(this._inputDir, from, d.nameNoExt);
      }

      // prevent files and folders named * as they would create conflicting routes
      if (item.nameNoExt === '*') {
        logger(`skipping '${item.filePath}' (* is a forbidden name).`);
        return;
      }

      // check if dynamic
      let isDynamic;
      try {
        d.isDynamic = stru.isDynamic(d.nameNoExt);
      } catch (e) {
        logger(`skipping file '${item.filePath}' (invalid name).`);
        return;
      }

      // skip index file if we are in a dynamic folder and parent folder holds
      // a dynamic file since they would virtually resolve to the same react router path
      //
      // test/
      //  [id].js     -> /test/:id
      //  [param]
      //    index.js  -> /test/:param
      if (d.nameNoExt === 'index' && parentDirInfo.hasDynamicFile && parentDirInfo.isDynamicDir) {
        logger(`skipping file ${item.filePath} (conflict with parent folder dynamic file)`);
        return;
      }


      if (d.isDir && d.isDynamic) {
        dynamicFolderCount++;
        // skip dynamic folder if we already have one in directory
        // We could merge both folder and check for conflicts but seems to me that the price is low compared to the loss of clarity
        if (dynamicFolderCount > 1) {
          logger(`skipping folder '${item.filePath}' (dynamic folder already exists).`);
          return;
        }
      }

      if (!item.isDir && d.isDynamic) {
        dynamicFileCount++;
        // skip dynamic file if we already have one in directory since they would virtually resolve to the same react router path
        //
        // test/
        //   [a].js -> /test/:a
        //   [b].js -> /test/:b
        if (dynamicFileCount > 1) {
          logger(`skipping file '${item.filePath}' (dynamic file already exists).`);
          return;
        }
      }

      if (!item.isDir) {

        const relativeFolderPath = path.join(this._relativePath, cleanInput);
        d.relativeFilePath = `${relativeFolderPath}/${item.name}`;

        if (!d.hasNested) {
          return d;
        }

        return d;
      }

      // skip empty folder
      // this if is mainly for debug as it would make no difference to remove it
      if (!await fsu.hasFiles(item.filePath)) {
        logger(`skipping folder '${item.filePath}' (empty folder).`);
        return;
      }

      return d;
    });

    // remove falsy values
    let keepInfos = _.compact(infos);

    // if we have dynamic index folder, all other dynamic path will never be reached since we have to set exact false to make nested routes working and the route will end up being first in the config object..
    // => remove all other file/folder and log warning
    if (dynamicIndexDir) {

      const keep = _.filter(keepInfos, (info) => {

        if (info.nameNoExt === 'index') {
          return true;
        }

        const type = info.isDir ? 'folder' : 'file';
        logger(`skipping ${type} ${info.filePath} (nested index would prevent this route from ever being reached)`);
        return
      });

      return [keep, dynamicFileCount, dynamicFolderCount];
    }

    return [keepInfos, dynamicFileCount, dynamicFolderCount];
  }

  // list all items in a given folder
  // and returns extensive info for each
  // empty folder will be ignored
  async lsDetails(from, parentDirInfo) {

    // list all items in folder
    const names = await fsu.ls(from);

    // returns an array where files are first and folders second
    // this is required for getInfo to work properly:
    // - dynamic folders need to know if parent folder has a dynamic file which would not work if items weren't treated first
    const items = await this.sortAndFilter(from, names);

    // get extensive info for all files in current folder and dynamic counters
    const [
      infos,
      dynamicFileCount,
      dynamicFolderCount
    ] = await this.getInfo(from, parentDirInfo, items);

    // compute sorting scores
    this.getSortScore(infos, parentDirInfo);

    // split files, folders, and nested folders for easier consumption
    const map = _.reduce(infos, (acc, item, index) => {

      // all files
      if (!item.isDir) {
        acc.files[item.nameNoExt] = item;
        return acc;
      }

      // only folders can be nested
      if (item.isNested) {
        acc.nested[item.nameNoExt] = item;
        return acc;
      }

      acc.folders[item.nameNoExt] = item;

      return acc;
    }, {
      files: {},
      folders: {},
      nested: {},
    });

    return [map, dynamicFileCount];
  }

  async handleKeywords(absolutePath) {

    if (!this._shouldParse) {
      return {};
    }

    if (this._cache[absolutePath]) {
      const scope = this._cache[absolutePath];
      return scope;
    }

    const scope = await getCode(absolutePath, this._keywords);
    this._cache[absolutePath] = scope;

    return scope;
  }

  async handleFiles(items) {

    const keepFiles = [];
    const retainFiles = [];
    // files always take precedence over folders

    const fileNames = _.keys(items.files);
    await Promise.map(fileNames, async (name) => {

      const item = items.files[name];

      const p = path.resolve('.', item.filePath);

      const scope = await this.handleKeywords(p);

      if (!item.hasNested) {

        const file = {
          ...scope,
          score: item.score,
          componentPath: item.relativeFilePath,
          path: item.routePath,
          exact: true,
        };

        if (file.score === 5) {
          retainFiles.push(file);
          return;
        }

        keepFiles.push(file);
        return;
      }

      const nestedFolder = items.nested[item.nameNoExt];
      const dirInfo = _.assign({}, this._parentDirInfo, {
        isDynamicDir: nestedFolder.isDynamic && nestedFolder.isDir,
        isNestedDir: true,
      })
      const routes = await this.getRoutes(nestedFolder.filePath, dirInfo);
      const file = {
        ...scope,
        score: item.score,
        componentPath: item.relativeFilePath,
        path: item.routePath,
        routes,
        exact: false,
      };

      if (file.score === 5) {
        retainFiles.push(file);
        return;
      }

      keepFiles.push(file);
    });

    return [ keepFiles, retainFiles ];
  }

  async handleFolders(items, hasDynamicFile) {

    const keepDir = [];
    const retainDir = [];

    const folderNames = _.keys(items.folders);
    await Promise.map(folderNames, async (name) => {
      const item = items.folders[name];

      const dirInfo = _.assign({}, this._parentDirInfo, {
        isDynamicDir: item.isDynamic && item.isDir,
        hasDynamicFile,
      })
      const subLevel = await this.getRoutes(item.filePath, dirInfo);
      if (item.score === 4) {
        retainDir.push(...subLevel);
        return;
      }

      keepDir.push(...subLevel);
    });

    return [keepDir, retainDir];
  }

  async getRoutes(from, parentDirInfo) {

    // list everything in directory with extensive info
    const [items, hasDynamicFile] = await this.lsDetails(from, parentDirInfo);
    const [filesStart, filesEnd ] = await this.handleFiles(items);
    const [foldersStart, foldersEnd ] = await this.handleFolders(items, hasDynamicFile);

    const res = [
      ..._.sortBy(filesStart, 'score'),
      ...foldersStart,
      ...foldersEnd,
      ..._.sortBy(filesEnd, 'score'),
    ];

    return _.map(res, (o) => {
      delete o.score;
      return o;
    });
  }
}

export default Engine;
