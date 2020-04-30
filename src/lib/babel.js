import traverse from '@babel/traverse';
import _ from 'lodash';
import path from 'path';
import debug from 'debug'

const logger = debug('rgr');

function extractValue(declaration) {

  switch (declaration.init.type) {
    case 'BooleanLiteral':
    case 'NumericLiteral':
    case 'StringLiteral':
      return declaration.init.value;
    case 'ArrayExpression': {
      const elements = declaration.init.elements;
      const arr = [];
      _.each(elements, (element) => {
        if (element.type !== 'BooleanLiteral' && element.type !== 'NumericLiteral' && element.type !== 'StringLiteral') {
          return;
        }
        arr.push(element.value);
      });

      return arr;
    }
    default:
      logger(`unhandle type: ${declaration.init.type}`);
  }
}


async function getCode(file, keywords = []) {

  const scope = {};
  try {

    const { ast } = await require('@babel/core')
      .transformFileAsync(file, {
        code: false,
        ast: true,
        babelrc: false,
        configFile: path.join(__dirname, '../babel.config.json'),
      })
    ;

    const exportNamedVisitor = function(path) {

      if (!path.node || !path.node.declaration) {
        return;
      }

      if (path.node.declaration.type === 'FunctionDeclaration') {
        const check = path.node.declaration.id.name;
        if (!_.includes(keywords, check)) {
          return;
        }

        this[check] = true;
        return;
      }

      if (path.node.declaration.type === 'VariableDeclaration') {
        // declarations should always exist but better be safe than sorry
        const declarations = _.get(path.node, 'declaration.declarations', []);

        const first = _.first(declarations);
        if (!first) {
          return;
        }

        const check = first.id.name;
        if (!_.includes(keywords, check)) {
          return;
        }

        this[check] = extractValue(first);
        return;
      }
    }

    traverse(ast, {
      ExportNamedDeclaration: _.bind(exportNamedVisitor, scope),
    });

  } catch (e) {
    logger('getCode error', e);
    return;
  }

  return scope;
}

export default getCode;
