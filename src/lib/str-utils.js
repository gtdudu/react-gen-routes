import _ from 'lodash';

export function isDynamic(name) {

  let countOpen = 0
  let countClose = 0

  _.each(name, (letter) => {

    if (letter === '[') {
      countOpen++;
    }

    if (letter === ']') {
      countClose++;
    }
  });

  if (!countOpen && !countClose) {
    // no parameter => all good
    return false;
  }

  if (
    countOpen !== 1 || countClose !== 1 ||
    !(_.first(name) === '[' &&  _.last(name) === ']')
  ) {
    throw new Error('wrong name');
  }

  const param = _.join(_.drop(_.dropRight(name)), '');
  return true;
}

export function stripRootDir(rootDir, from) {
  return from
    .replace(rootDir, '')
    .replace(rootDir.slice(2), '')
  ;
}

export function stripExtension(name) {
  const splitted = _.split(name, '.');

  if (_.size(splitted) < 2) {
    return _.first(splitted);
  }

  const remains = _.dropRight(splitted);
  return _.first(remains);
}


export function handleBrackets(name) {
  let countOpen = 0
  let countClose = 0

  _.each(name, (letter) => {

    if (letter === '[') {
      countOpen++;
    }

    if (letter === ']') {
      countClose++;
    }
  });

  if (!countOpen && !countClose) {
    // no parameter => all good
    return name;
  }

  if (
    countOpen !== 1 || countClose !== 1 ||
    (_.first(name) !== '[' && _.last(name) !== ']')
  ) {
    throw new Error('wrong name');
  }

  const param = _.join(_.drop(_.dropRight(name)), '');

  if (param === '*') {
    return '*';
  }

  return `:${param}`;
}

export async function createRoutePath(inputDir, rootDir, nameNoExt) {

  const s = _.split(rootDir, '/');
  const a = _.map(s, (o) => {

    if (o === "index") {
      return false;
    }

    return this.handleBrackets(o);
  });

  const root = _.join(_.compact(a), '/');

  const n = exports.handleBrackets(nameNoExt);

  const strippedRootDir = exports.stripRootDir(inputDir, root);
  if (nameNoExt === 'index' && !_.size(strippedRootDir)) {
    return '/';
  }

  if (nameNoExt === 'index') {
    return strippedRootDir;
  }

  return exports.stripRootDir(inputDir, root) + '/' + n;
}

export default {
  isDynamic,
  stripRootDir,
  stripExtension,
  createRoutePath,
  handleBrackets,
}
