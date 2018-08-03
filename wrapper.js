"use strict";

const {existsSync} = require("fs");
const {dirname, resolve} = require("path");

/**
 * TypeScript enums
 */
const JavaScriptKind = 1;
const ModuleExports = 2;
const ThisKeyword = 99;

const lazyDefinitions = ["defineLazyGetter", "defineLazyServiceGetter", "defineLazyPreferenceGetter"];

/**
 * Patch the typescript namespace object with custom methods to handle JSMs.
 */
function patch(ts) {
  if (ts._patched) {
    return;
  }
  ts._patched = true;

  // this.EXPORTED_SYMBOLS = ["Foo", "Bar"]
  function isEXPORTED_SYMBOLS(expr) {
    return ts.isBinaryExpression(expr) &&
        ts.isPropertyAccessExpression(expr.left) &&
        ts.idText(expr.left.name) === "EXPORTED_SYMBOLS";
  }

  // ["Foo", "Bar"] -> {Foo, Bar}
  function transpileExports(expr) {
    return ts.createObjectLiteral(expr.right.elements.map(e => {
      let p = ts.createShorthandPropertyAssignment(e.text);
      p.pos = e.pos;
      p.end = e.end;
      return p;
    }));
  }

  // XPCOMUtils.defineLazyGetter(this, "foo", ...)
  function isLazyDefinition(expr) {
    return ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        expr.expression.expression.escapedText ===  "XPCOMUtils" &&
        lazyDefinitions.includes(expr.expression.name.escapedText) &&
        expr.arguments && expr.arguments.length > 2 &&
        expr.arguments[0].kind === ThisKeyword &&
        ts.isStringLiteral(expr.arguments[1]);
  }

  // defineLazyGetter(this, "foo") -> var foo;
  function transpileLazyDefinition(expr) {
    let decl = ts.createVariableDeclaration(expr.arguments[1].text);
    decl.name.pos = expr.arguments[1].pos + 2;
    decl.name.end = expr.arguments[1].end - 1;
    return decl;
  }

  let {getSpecialPropertyAssignmentKind} = ts;
  ts.getSpecialPropertyAssignmentKind = function(expr) {
    if (isEXPORTED_SYMBOLS(expr)) {
      return ModuleExports;
    }
    return getSpecialPropertyAssignmentKind(expr);
  }

  let {bindSourceFile} = ts;
  ts.bindSourceFile = function(file, ...args) {
    let libDOM = file.fileName.endsWith("lib.dom.d.ts");

    if (!file._patched && (libDOM || file.fileName.endsWith(".jsm"))) {
      file._patched = true;

      let varStatement;
      let lazyVars = [];

      for (let node of file.statements) {
        if (ts.isExpressionStatement(node) && isEXPORTED_SYMBOLS(node.expression)) {
          node.expression.right = transpileExports(node.expression);
        }

        if (ts.isVariableStatement(node)) {
          varStatement = node;
        }

        if (ts.isExpressionStatement(node) && isLazyDefinition(node.expression)) {
          lazyVars.push(transpileLazyDefinition(node.expression));
        }

        // Something something issue#.
        if (libDOM && ts.isVariableStatement(node) &&
            ts.idText(node.declarationList.declarations[0].name) === "MessageChannel") {
          node.declarationList.declarations[0].name.escapedText += "Dummy";
        }
      }

      // Add fake lazyVars to the var statement.
      if (varStatement && lazyVars.length) {
        let {declarations, _count = declarations.length} = varStatement.declarationList;
        declarations.splice(_count, declarations.length, ...lazyVars);
        varStatement.declarationList._count = _count;
      }
    }
    return bindSourceFile(file, ...args);
  }

  let {ensureScriptKind} = ts;
  ts.ensureScriptKind = (fileName, scriptKind) => {
    if (fileName.endsWith(".jsm")) {
      return JavaScriptKind;
    }
    return ensureScriptKind(fileName, scriptKind);
  }

  let {extensionFromPath} = ts;
  ts.extensionFromPath = function(path) {
    if (path.endsWith(".jsm")) {
      return ".js";
    }
    return extensionFromPath(path);
  }

  let {createProgram} = ts;
  ts.createProgram = function(...args) {
    let host = args[0].host || args[2];
    host.resolveModuleNames = function(moduleNames, containingFile) {
      return moduleNames.map(name => {
        let resolvedFileName = resolve(dirname(containingFile), name);
        return existsSync(resolvedFileName) && {resolvedFileName}; 
      });
    }
    return createProgram(...args);
  };
};

/**
 * @param {string} module
 *        Path to original Typescript module to load and patch.
 * @param {string} [mainMethod]
 *        tsc.js runs the main method `executeCommandLine` before we have
 *        the chance to patch the `ts` object, so we need to intercept it.
 */
function load(module, mainMethod) {
  if (!mainMethod) {
    let ts = require(module);
    patch(ts);
    return ts;
  }

  Object.defineProperty(Object.prototype, mainMethod, {
    set(value) {
      patch(this);
      delete Object.prototype[mainMethod];
      this[mainMethod] = value;
    },
    configurable: true,
  });

  require(module);
}

module.exports = {load};
