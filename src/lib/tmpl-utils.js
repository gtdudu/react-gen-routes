import _ from 'lodash';
import path from 'path';
import ejs from 'ejs';
import Promise from 'bluebird';
import debug from 'debug'

import fsu from './fs-utils';

const logger = debug('rgr');

// transform json string in js string
// improves output readability in ide
export function getJsString(str) {

  let count = 0;
  let tmp = [];

  const check = _.split(str, ':');
  if (_.size(check) < 2) {
    return str.replace(/"/g, "'");
  }

  for (var i = 0; i < str.length; i++) {

    if(count < 2 && str[i] === '"') {
      count++;
      continue;
    }


    if(count >= 2 && str[i] === '"') {
      tmp.push("'");
      continue;
    }

    tmp.push(str[i]);
  }

  return _.join(tmp, '');
}

// given a temporary json representing the routes
// transforms all lines holding componentPath based on component template
// this allows dynamic imports off components
// returns routes file as an Array<lines> in JS object format
export async function fillRoutesTemplate(tmpDir, templateDir) {

  const routesLines = await fsu.getFileLines(tmpDir, 'routes.js');

  const root = templateDir ?
    path.join('./', templateDir) :
    path.join(__dirname, '../templates')
  ;

  let importsLines;
  try {
    importsLines = await fsu.getFileLines(root, 'imports');
  } catch (e) {
    logger('Could not find imports template file');
    throw e;
  }

  let templatedLines;
  try {
    templatedLines = await fsu.getFileLines(root, 'component');
  } catch (e) {
    logger('Could not find component template file');
    throw e;
  }

  const templates = _.map(templatedLines, (line) => {
    return ejs.compile(line);
  });

  const res = [];
  await Promise.each(routesLines, async(line) => {
    const trimed = _.trimStart(line);
    // number of spaces to add back for nice formating
    const diffLen = _.size(line) - _.size(trimed);

    // add line to file

    if (!_.startsWith(trimed, '"componentPath"')) {
      res.push(getJsString(line));
      return;
    }

    const value = _.trim(line
      .replace('"componentPath": "', '')
      .replace('",', '')
    );

    const relativePath = _.startsWith(value, '../') ?
      value :
      `./${value}`
    ;
    const split = _.split(relativePath, '/');
    const componentRootPath = _.join(_.slice(split, 0, _.size(split) - 1), '/');
    const filename = _.last(split);
    const splitFilename = _.split(filename, '.')
    const name = _.join(_.slice(splitFilename, 0, _.size(splitFilename) - 1), '.');
    const extension = _.last(splitFilename);

    _.each(templates, (template) => {
      // process template file
      const templatedLine = template({
        componentPath: relativePath,
        componentRootPath,
        filename,
        name,
        extension
      });
      // add spaces back
      let spaces = '';
      for (var i = 0; i < diffLen; i++) {
        spaces += ' ';
      }
      res.push(`${spaces}${templatedLine}`);
    });
  });

  // tweek export
  res[0] = `const routes = {`
  res.push('\nexport default routes;');

  const lines = [
    ...importsLines,
    '\n',
    ...res,
  ];

  const routesFile = lines.join('\n');
  return routesFile;
}

export default {
  getJsString,
  fillRoutesTemplate,
};
