import _ from 'lodash';
import getopts from 'getopts';

import Engine from './';

const start = async(args) => {

  const options = getopts(process.argv.slice(2), {
    alias: {
      extensions: 'e',
      intputDir: 'i',
      outputDir: 'o',
      filename: 'f',
      templatesDir: 't',
      keywords: 'k',
      watch: 'w'
    },
    string: ['i', 'o', 'f', 'e', 'k'],
    boolean: ['w'],
    default: {
      keywords: '',
      extensions: 'js',
      filename: 'routes.js',
      watch: false,
    },
  });

  const engine = new Engine({
    inputDir: options.intputDir,
    outputDir: options.outputDir,
    keywords: options.keywords,
    watch: options.watch,
    filename: options.filename,
    templatesDir: options.templatesDir,
    extensions: options.extensions,
  });

  await engine.safeRun();
};

start();
