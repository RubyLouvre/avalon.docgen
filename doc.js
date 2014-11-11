#!/usr/bin/env node
"use strict";
/**
 * Avalon widget doc generator
 *
 * 扫描为 vm.someName = someValue， 以及 widget.defaults = {someName: someValue}指定的@config或@interface注释
 *
 *
 * @author kyrios.li
 *
 */
var esprima = require('./esprima'),
    fs = require('fs'),
    js_beautify = require('./js_beautify').js_beautify,
    html_beautify = require('./html_beautify').style_html;
// end import modules
var tmpl = require('./ejs').compile(fs.readFileSync(__dirname + '/template.html', 'utf8'), {
    open: '<%', close: '%>'
});

exports.main = function (path) {
    // read all directories
    fs.readdirSync(path).forEach(function (fileName) {
        if (!/^\w+$/.exec(fileName)) return;
        var filePath = path + '/' + fileName,
            stat = fs.statSync(filePath);
        if (!stat.isDirectory()) {
            return;
        }
        // Assume extension name is fileName, try to find "avalon.{extension}.js"
        handleExtension(filePath, fileName);

    });

};

exports.handleExtension = handleExtension;
//移除无用的HTML标签
function trimHTML(v) {
    v = String(v);
    var regexp = /<("[^"]*"|'[^']*'|[^'">])*>/gi;
    if (v) {
        v = v.replace(regexp, "");
        return (v && v !== '&nbsp;' && v !== '&#160;') ? v.replace(/\"/g, "&quot;") : "";
    }
    return v;
}

var rCommentSplitter = /^\*|\r?\n[\t ]*\*(?:\s*|$)/g;

function handleExtension(dir, name) {
    var content, program;
    try {
        content = fs.readFileSync(dir + '/avalon.' + name + '.js', 'utf8');
        program = esprima.parse(content, {
            range: true,
            raw: true,
            comment: true
        });
    } catch (e) {
        return;
    }
    console.log('docgen avalon.' + name + '.js');
    // get names from first comment.
    var comments = program.comments, index = 0,
        TYPE_LINE = 'Line', TYPE_BLOCK = 'Block';
    if (!comments.length) {
        return;
    }
    var data = {
        cnName: name,
        enName: name,
        introduce: 'TODO: add introduce',
        summary: "",
        trs: [],
        links: [],
        others: []
    };

    var configs = [], interfaces = [];
    // walk around program
    program.body.some(function (stmt) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression' && stmt.expression.callee.name === 'define') { // calls define
            var args = stmt.expression['arguments'],
                lastArg = args [args.length - 1];
            if (lastArg.type === 'FunctionExpression') {
                lastArg.body.body.forEach(function (stmt) {
                    if (stmt.type === 'VariableDeclaration') { // find var widget = function()...
                        stmt.declarations.forEach(function (decl) {
                            if (decl.id.name === 'widget' && decl.init) {
                                onVarWidget(decl.init);
                            }
                        });
                    } else if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
                        // find widget.defaults =
                        var expr = stmt.expression;
                        //console.log('assign', expr.left);
                        if (expr.left.type === 'MemberExpression' && expr.left.property.name === 'defaults') {
                            var rval = expr.right;
                            while (rval.type === 'AssignmentExpression') {
                                rval = rval.right;
                            }
                            if (rval.type === 'ObjectExpression') {
                                onAssignWidgetDefaults(rval.properties);
                            }
                        }
                    } else if (stmt.type === 'FunctionDeclaration' && stmt.id.name.toLowerCase() === name) { // function Name(...)
                        onConstructor(stmt.body.body);
                    }
                });
            }
            return true; // End program.body.some()
        }
    });

    function onConstructor(body) {
        body.forEach(function (stmt) {
            var expr = stmt.type === 'ExpressionStatement' && stmt.expression;
            if (expr && expr.type === 'AssignmentExpression' &&
                expr.left.type === 'MemberExpression' && expr.left.object.type === 'ThisExpression') {
                // this.xxx = xxx
                console.log('onAssign', expr.left.property.name);
                onAssignment(expr);
            }
        });
    }

    function onVarWidget(expr) {
        while (expr.type === 'AssignmentExpression') {
            expr = expr.right;
        }// widget = function(elem, data, vmodels)
        // find define expression
        expr.body.body.forEach(function (stmt) {
            if (stmt.type === 'VariableDeclaration') {
                stmt.declarations.forEach(function (decl) {
                    if (decl.id.name === 'vmodel' && decl.init) {
                        var init = decl.init;
                        if (init.type === 'CallExpression' && init.callee.type === 'MemberExpression' &&
                            init.callee.object.name === 'avalon' && init.callee.property.name === 'define') {
                            // avalon.define
                            var args = init['arguments'], cb = args[args.length - 1];
                            onVarVmodel(cb.params[0].name, cb.body.body);
                        }
                    }
                });
            }
        });
    }

    function onVarVmodel(vm, body) {
        // assert.ok(expr.type === 'CallExpression'
        body.forEach(function (stmt, i) {
            var expr = stmt.type === 'ExpressionStatement' && stmt.expression;
            if (expr && expr.type === 'AssignmentExpression' &&
                expr.left.type === 'MemberExpression' && expr.left.object.name === vm) {
                onAssignment(expr);
            }
        });
    }

    function onAssignment(expr) {
        var rval = expr.right;
        while (rval.type === 'AssignmentExpression') {
            rval = rval.right;
        }
        var propName = expr.left.property.name, comment;
        // find comment
        if (comment = findCommentBefore(expr.range[0])) {
            // find comment before assign expression
            onComment(propName, rval, comment);
        } else if (comment = findInlineCommentAfter(expr.range[1])) {
            onComment(propName, rval, comment);
        } else if (rval.type === 'FunctionExpression' && (comment = findInlineCommentAfter(rval.body.range[0] + 1))) {
            // find comment after function decl
            onComment(propName, rval, comment);
        }
    }

    function onAssignWidgetDefaults(properties) {
        properties.forEach(function (prop) {
            // find comment
            if (prop.key.name === 'getTitle') {
                debugger;
            }
            var propName = prop.key.name, comment;
            if (comment = findCommentBefore(prop.range[0])) {
                onComment(propName, prop.value, comment);
            } else if (prop.value.type === 'ObjectExpression' && (comment = findInlineCommentAfter(prop.value.range[0] + 1))) {
                onComment(propName, null, comment);
            } else {
                var propEnd = prop.range[1],
                    m = /\s*,/.exec(content.substr(propEnd));
                if (m) {
                    propEnd += m[0].length;
                }
                if (comment = findInlineCommentAfter(propEnd)) {
                    onComment(propName, prop.value, comment);
                }
            }

        });
    }

    function onComment(name, expr, comment) {
        //console.log(name, expr, comment);
        var defaultVal, params;
        if (!expr) {
            defaultVal = '';
        } else if (expr.type === 'FunctionExpression') {
            name = name + '(' + expr.params.map(function (param) {
                return param.name
            }).join() + ')';
            defaultVal = '';
        } else {
            defaultVal = content.substring(expr.range[0], expr.range[1])
        }

        var obj, type;

        if (comment.type === TYPE_BLOCK) {
            comment.value.replace(rCommentSplitter, '\n').split('\n@').forEach(function (line) {
                var mKey = /(\w+)\s*(?:(?:(\w+)\s*)?\{([\w\|]+)\}\s*)?/.exec(line);
                if (!mKey) return;
                var key = mKey[1], value = line.substr(mKey[0].length);
                if (key === 'config' || key === 'interface') {
                    obj = {
                        name: name,
                        type: mKey[3] || guessType(expr),
                        defaultValue: defaultVal,
                        explain: value,
                        params: params
                    };
                    type = key;
                } else if (obj && key === 'param') {
                    var paramName = mKey[2];
                    if (!paramName && expr.type === 'FunctionExpression') {
                        paramName = expr.params[obj.params ? obj.params.length : 0].name;
                    }
                    (obj.params || (obj.params = [])).push({
                        name: paramName,
                        type: mKey[3] || '',
                        desc: value
                    });
                } else if (obj && key === 'returns') {
                    (obj.params || (obj.params = [])).push({
                        name: '返回',
                        type: mKey[3] || '',
                        desc: value
                    });
                    obj.returns = value
                } else {
                    console.log('thrown comment line', key);
                }
            })

        } else {
            var mKey;
            if (mKey = /^\s*@(config|interface)\s*(?:\{([\w|]+)\})?/.exec(comment.value)) {
                var key = mKey[1], value = comment.value.substr(mKey[0].length);
                if (key === 'config' || key === 'interface') {  // single line config
                    obj = {
                        name: name,
                        type: mKey[2] || guessType(expr),
                        defaultValue: defaultVal,
                        explain: value
                    };
                    type = key;
                }
            }
        }
        if (type === 'config') configs.push(obj);
        else if (type === 'interface') interfaces.push(obj);
    }

    function guessType(expr) {
        if (!expr) return '';
        if (expr.type === 'Literal') {
            return (typeof expr.value).replace(/^\w/, function (m) {
                return m.toUpperCase();
            });
        }
        var m = /^(.+)Expression$/.exec(expr.type);

        if (m) {
            return m[1];
        }
        return expr.type;
    }

    function findCommentBefore(before) { //TODO: binary search
        for (var i = 0, L = comments.length - 1; i < L; i++) {
            if (comments[i].range[1] > before) break;
        }
        var comment = comments[i - 1];
        if (comment && !content.substring(comment.range[1], before).trim()) {
            // only blank
            comments.splice(i - 1, 1);
            return comment;
        }
    }

    function findInlineCommentAfter(after) { //TODO: binary search
        for (var i = 0, L = comments.length; i < L; i++) {
            if (comments[i].range[0] >= after) break;
        }
        if (i === L) return;
        var comment = comments[i], gap = content.substring(after, comment.range[0]);
        //console.log('  found comment after: ', after, gap);
        if (comment.type === TYPE_LINE && !gap.trim() && gap.indexOf('\n') === -1) {
            // only blank
            comments.splice(i, 1);
            return comment;
        }
    }


    comments.forEach(function (comment) {
        if (comment.type === TYPE_BLOCK) { // block comment
            var lines = comment.value.replace(rCommentSplitter, '\n').split('\n@');
            lines.some(function (line) {
                var mKey = /(\w+)\s*/.exec(line);
                if (!mKey) return;
                var key = mKey[1], value = line.substr(mKey[0].length);
                if (key === 'config') {
                } else if (key === 'interface') {
                } else if (key === 'links') {
                    var rLink = /\[(.+?)\]\((.+?)\)/g, m;
                    while (m = rLink.exec(value)) {
                        data.links.push({text: m[1], href: m[2]});
                    }
                } else if (key === 'other') {
                    data.others.push(filterValue(value));
                } else { // others
                    if (key === 'introduce') {
                        value = filterValue(value);
                    }
                    data[key] = value;
                }
            });
        } else { // line comment
            var mKey;
            if (mKey = /^\s*@(config|interface)\s/.exec(comment.value)) {
                var key = mKey[1], value = comment.value.substr(mKey[0].length);
                if (key === 'config') {  // single line config
                } else {
                }
            }

        }
    });

    if (configs.length) {
        data.trs = data.trs.concat({span: '配置参数'}, configs);
    }
    if (interfaces.length) {
        data.trs = data.trs.concat({span: '接口方法与固有属性'}, interfaces);
    }

    //console.log(data);
    data.introduceInHead = trimHTML(data.introduce.substr(0, 300));
    var result = html_beautify(tmpl(data), {
        unformatted: ['pre']
    });
    fs.writeFile(dir + '/avalon.' + name + '.doc.html', result);
    //console.log(tmpl(data));

    function filterValue(value) {
        return value.replace(/```(\w+)?\r?\n([\w\W]*?)```/g, function (m, lang, content) {
            if (lang === 'js')lang = 'javascript';
            if (lang === 'html') {
                //TODO: escape html
                content = html_beautify(content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            } else if (lang === 'javascript') {
                // beautify
                content = js_beautify(content);
            }
            return '<pre class="brush:' + lang + ';gutter:false;toolbar:false;">' + content + '</pre>';
        });
    }
}
if (process.mainModule === module) {
    if (process.argv.length === 2) {
        console.log('Usage: avalon-doc [directory|js file|--all]');
    } else if (process.argv[2] === '--all') {
        exports.main(".");
    } else {
        var path = process.argv[2],
            m = /(^|\/|\\)avalon\.(\w+)\.js$/.exec(path);
        if (m) {
            var dir = m[1] ? path.substr(0, path.length - m[0].length) : '.';
            exports.handleExtension(dir, m[2]);
        } else if (fs.statSync(path).isDirectory()) {
            //exports.main(path);
            if (path[path.length - 1] === '/') path = path.substr(0, path.length - 1);
            exports.handleExtension(path, path.substr(path.lastIndexOf('/') + 1));
        } else {
            console.log('Usage: avalon-doc [directory|js file|--all]');
        }
    }
}
