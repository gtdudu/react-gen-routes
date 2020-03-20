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
      watch: 'w'
    },
    string: ['i', 'o', 'f', 'e'],
    boolean: ['w'],
    default: {
      extensions: 'js',
      filename: 'routes.js',
      watch: false,
    },
  });

  const engine = new Engine({
    inputDir: options.intputDir,
    outputDir: options.outputDir,
    watch: options.watch,
    filename: options.filename,
    templatesDir: options.templatesDir,
    extensions: options.extensions,
  });

  try {
    await engine.run();
    console.log('All good: routes.js has been generated');
  } catch (e) {
    console.log('engine failed to run', e);
  }

};

start();
