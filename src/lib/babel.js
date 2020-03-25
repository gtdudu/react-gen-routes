import traverse from '@babel/traverse';
import _ from 'lodash';
import path from 'path';
import debug from 'debug'

const logger = debug('rgr');

async function getCode(file, keywords = []) {

  const scope = {};
  try {

    const { ast } = await require('@babel/core')
      .transformFileAsync(file, {
        code: false,
        ast: true,
        babelrc: true,
        babelrcRoots: [
          path.resolve('.'),
        ]
      })
    ;

    let hasGetInitialData = false;
    const visitor = function(path) {

      if (!path.node || !path.node.id || !path.node.id.name) {
        return;
      }

      const record = path.node.id.name;
      if (!_.includes(keywords, record)) {
        return;
      }

      this[record] = true;
      // this.hasGetInitialData = path.node.id.name === 'getInitialData';
    }

    const bindedVisitor = _.bind(visitor, scope);

    traverse(ast, {
      FunctionDeclaration: bindedVisitor
    });

  } catch (e) {
    logger('getCode error', e);
    return;
  }

  return scope;
}

export default getCode;
