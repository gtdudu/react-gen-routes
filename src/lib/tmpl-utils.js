import _ from 'lodash';
import path from 'path';
import ejs from 'ejs';
import Promise from 'bluebird';

import fsu from './fs-utils';

// transform json string in js string
// improves output readability in ide
export function getJsString(str) {

  let count = 0;
  let tmp = [];

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
    console.log('Could not find imports template file');
    throw e;
  }

  let templatedLines;
  try {
    templatedLines = await fsu.getFileLines(root, 'component');
  } catch (e) {
    console.log('Could not find component template file');
    throw e;
  }

  if (_.size(templatedLines) !== 1) {
    console.log('expected one template string with "<%= componentPath %>" variable');
    console.log('got', templatedLines, 'instead');
    throw new Error(`${templateDir}/component does not exist or is an empty file`);
  }

  const template = ejs.compile(templatedLines[0]);

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


    // process template file
    const templatedLine = template({
      componentPath: relativePath,
    });

    // add spaces back
    let spaces = '';
    for (var i = 0; i < diffLen; i++) {
      spaces += ' ';
    }
    res.push(`${spaces}${templatedLine}`);

    const componentPath = `${spaces}componentPath: "${relativePath}",`;
    res.push(componentPath);
  });

  // tweek export
  res[0] = `const routes = {`
  // console.log(outputFile);
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
