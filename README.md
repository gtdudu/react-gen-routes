<h3 align="center">@gtdudu/react-gen-routes</h3>
<p align="center">
  <a href="https://github.com/gtdudu/react-gen-routes#licence">
    <img src="https://img.shields.io/badge/licence-MIT-green" alt="Licence">
  </a>
  <a href="https://github.com/gtdudu/react-gen-routes">
    <img src="https://img.shields.io/github/last-commit/gtdudu/react-gen-routes" alt="Last update">
  </a>
  <a href="https://github.com/gtdudu/react-gen-routes">
    <img src="https://img.shields.io/github/v/tag/gtdudu/react-gen-routes" alt="Current version">
    </a>
</p>

#

An easy way to manage client routing for react app similar to the one in [next.js](https://github.com/zeit/next.js).  
Automates creation of [react-router-config](https://github.com/ReactTraining/react-router/tree/master/packages/react-router-config) config file based on file tree.  
Automatic reloading on file system events.

# Table of contents

- [Why](#why)
- [Installation](#installation)
- [Usage](#usage)
  - [Enable logs](#enable-logs)
  - [Using --templatesDir option](#using---templatesdir-option)
  - [Using --watch option](#using---watch-option)
  - [Using --keywords option](#using---keywords-option)
- [Name convention](#name-convention)
  - [Accepted names](#accepted-names)
  - [Dynamic file and folder](#dynamic-file-and-folder)
- [Routing](#routing)
  - [Creating a static route](#creating-a-static-route)
  - [Creating a dynamic route](#creating-a-dynamic-route)
  - [Creating a catch all route](#creating-a-catch-all-route)
  - [Creating nested routes](#creating-nested-routes)
- [Edge cases](#edge-cases)
- [Contribute](#contribute)
- [License](#license)

## Why

If you try to create a react app that works with server side rendering you will probably end up using react-router-config. This is fine but as soon as you add more routes the config file will grow and become more and more obscure.

If you've checked out next.js you've seen that they automatically manage routing based on a special directory architecture (pages/). I very much like this idea as it makes it really easy to understand what's going on with just a few simple rules!

This package attempts to replicate this feature and only this features.  
Everything else is up to you.

So why use this ?

- does only one job, create the routes config file
- customize input/output directory
- does not wrap react functions
- support nested routes
- support catch all routes

## Installation

```
npm install --save-dev @gtdudu/react-gen-routes
```

## Usage

`gt-rgr [args]`

- Mandatory args:

  - -i or --inputDir: relative path from project root to pages folder
  - -o or --outputDir: relative path from project root to config output folder

- Optional args:
  - -e or --extensions: coma separated list of accepted extensions, default to 'js'
  - -f or --filename: whatever you want the config file to be named, default to `routes.js`
  - -t or --templatesDir: path to `component` and `imports` templates folder
  - -w or --watch: boolean, set to true for automatic recomputing of config file on inputDir file system events (via chokidar), default to false
  - -k or --keywords: coma separated list of exports to search for in each component

### Enable logs

You need to set `DEBUG` env var to `rgr` to enable logs.

### Using --templatesDir option

This package assumes you're using [@loadable/component](https://github.com/gregberge/loadable-components) for code splitting.  
Each route will have a component field that looks like this:

```
  component: loadable(props => import('./pages/index.js')),
```

If that does not suit your needs you can specify the path to a templates folder holding two files:

- imports

By default our _imports_ template looks like this.

```
import loadable from '@loadable/component';
```

This will be appended on top of the routes config file.  
This can be as many lines as you want.

- component

By default our _component_ template looks like this.

```
component: loadable(props => import('<%= componentPath %>')),
i18n: loadable(props => import(`<%= componentRootPath %>/<%= name %>.i18n.${props.language}.js`)),
```

This template will be populated using ejs templating.

Available variables are:

- componentPath: full relative path to file from routes config
- componentRootPath: full relative path to folder where component file is located
- filename: name of component file with extension
- name: name without extension
- extension: extension

This file can be as many lines as you want, they will be added to every route object.

**Avoid using field `path`, `exact` and `routes` as this lib already takes care of those.  
Also, you need to have a field `component` in order for routes config to be correct.**

### Using --watch option

If you use --watch the package will use chokidar to listen for any file system events in input directory and recompute routes config accordingly.  
This watch is blocking so you need to use [npm-run-all](<[https://github.com/mysticatea/npm-run-all](https://github.com/mysticatea/npm-run-all)>) or [concurrently](https://github.com/kimmobrunfeldt/concurrently) to run both your server and the watch.  
It's also a good idea to wait for config file to be created before starting anything that relies on it.. you can use [wait-on](https://github.com/jeffbski/wait-on) for this.

I tend to use this:

```
// In packages.json scripts

"dev": "concurrently -r \"npm:watch:server\" \"npm:watch:routes\"",
"watch:routes": "gt-rgr -o ./src/shared -i ./src/shared/pages -w -f my-routes.js",
"watch:server": "wait-on ./src/shared/my-routes.js && [start server/nodemon/whatever here]",

// don't forget to install deps

npm i --save-dev concurrently
npm i --save-dev wait-on

```

### Using --keywords option

If set, each component file will be parsed using babel to search for exported variables matching values in keywords list.

If keyword references a function a boolean flag will be set on the route object.
If keyword references a Boolean, Integer, String, or an array of the above, value will be extracted and set on the route object.

Files will be parsed using preset `"@babel/preset-react",`.

For, instance:

Let's say your directory structure looks like:

```
pages/
  index.js
```

and index.js is:

```
export default Home() {
  return (
    <div>
      ...
    </div>
  );
}

export roles = ['admin', 'user'];

export function getInitialData() {

}
```

if you run with `-k getInitialData,roles` then the routes config will be:

```
import loadable from '@loadable/component';


const routes = {
  routes: [
    {
      roles: ['admin', 'user'],
      getInitialData: true,
      component: loadable(props => import('...relativePathToCmp here...')),
      path: '/',
      exact: true
    }
  ]
}

export default routes;
```

This is especially useful if you want to wrap your routes config to handle data fetching automatically without having to use a lib like [react-async](https://www.npmjs.com/package/react-async) in each component!

It's also convenient to wrap authentication and authorisation.

This can also be used to do statical analysis on routes file afterward.

**Babel must be able to parse your files**.

You should check for es6 support for your node version before using this ([node-green](https://node.green/))

If watch mode is on, the results will be cached to enhance performance.

## Name convention

### Accepted names

**You cannot name a file `*.js` nor a folder `*`.**  
If you do they will be ignored.

Furthermore, all **filenames with more than one dot will be ignored** while constructing routes file.

```
pages/
  component.js            -> this is ok
  component.styles.js     -> this will be ignored
```

### Dynamic file and folder

We need to distinguish dynamic file/folder from non-dynamic file/folder.  
If this sounds complicated, trust me, it's not.  
**A dynamic file/folder has its name inclosed between brackets!**

```
pages/
  not-dynamic.js
  [dynamic].js
```

Do not use any brackets for non dynamic files/folders.

```
// ALL those are considered incorect and will be will be ignored
[nop/
no]p/
n[op].js
[no]p.js
...
```

## Routing

This section assumes you use `--inputDir ./pages`

### Creating a static route

- To create a static route just create a file in your inputDir

```
pages/
  home.js

// home component will be accessible on url /home

```

- or a folder with an index.js file in it

```
pages/
  home/
    index.js

// index.js component will be accessible on url /home
```

- or a folder with a file in it !

```
pages/
  home/
    a.js

// a.js component will be accessible on url /home/a
```

- You get the idea...

Paths for `index.js` files are always computed from their parent folder.

```
pages/
  index.js

// index.js component will be accessible on url /

pages/
  /a
    /b
      index.js

// index.js component will be accessible on url /a/b !
```

### Creating a dynamic route

- Create a dynamic file

```
pages/
  [id].js

// [id].js component will be accessible on url /:id

```

- or a dynamic folder with an index.js file in it

```
pages/
  [id]/
    index.js

// index.js component will be accessible on url /:id
```

The name of your dynamic file/folder matters.  
Since we're not wrapping any react function, in the examples above you'll get back your parameter using regular [react-router]() `useParams` function.  
Like so:

```
  let { id } = useParams();
```

**You can create only one dynamic file and one dynamic folder per directory**  
**Extraneous dynamic files/folders will be ignored with no guarantee of which ones**

### Creating a catch all route

A catch all route is just like a dynamic routes.  
To create one the convention is to name your file `[*]`.  
The only difference is that they resolve to path `*` and not `:*`

```
/pages/
	index.js  -> /
	[*].js 	  -> /*
```

Catch all can also be folders.

```
/pages/
	index.js  		-> /
	[*]/
		index.js	-> /*
		[id].js		-> /*/:id
```

### Creating nested routes

- To create a nested route you need a file (the wrapper) and a folder that share the same name!

```
pages/
  wrapper.js
  wrapper/
    // all components in here will be sub routes of wrapper.js
```

- Nesting also works with dynamic files.

```
pages/
  [id].js                     -> /:id (exact: false)
  [id]/
    nested-component.js       -> /:id/nested-component (exact: true)
    [*].js 					  -> /:id/*
```

- and with index.js files even tho this is a **special case**.

If used, all other files and folders in current directory will be ignored.  
This is necessary because the wrapper needs `exact: false` to make nested routes working properly. Since indexes need to be first on their level this would prevent all other routes from ever showing up anyway.

```
pages/
  test.js                     -> will be ignored
  folder/
    index.js                  -> will be ignored
  index.js                    -> /
  index/
    index.js                  -> /
    nested-component.js       -> /nested-component
```

**Do not forget to use [react-router-config](https://github.com/ReactTraining/react-router/tree/master/packages/react-router-config) `renderRoutes` function in your wrappers !**  
Otherwise your childs won't be rendered.

### Edge cases

- Files implying duplicate routes will be ignored.

```
pages/
  [id].js
  [param]/
    index.js -> this file will be ignored

```

- Avoid using different param names at the same level

Consider the following structure:

```
pages/
  [id].js
  [param]/
    a.js
```

`[id].js` would resolve to `/:id`
`a.js` would resolve to `/:param/a.js`

This will work but it lacks clarity, it's much easier to follow if you do this instead:

```
pages/
  [id]/
    index.js
    a.js
```

`index.js` would resolve to `/:id`  
`a.js` would resolve to `/:id/a`

It's virtually the same thing but you don't have to track two different names for the same params.

# Contribute

If you have any idea to improve this project or any problem using it, feel free to open an [issue](https://github.com/gtdudu/react-gen-routes/issues).

# License

This project was developed by Tommy DURAND and is released under the MIT License.
