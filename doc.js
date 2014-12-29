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

    var statementWalkers = {
        ExpressionStatement: function (stmt) {
            onExpression(stmt.expression);
        },
        FunctionDeclaration: function (stmt) {
            walkStatements(stmt.body.body);
        },
        VariableDeclaration: function (stmt) {
            stmt.declarations.forEach(function (decl) {
                var expr = decl.init;
                if (!expr) return;
                while (expr.type === 'AssignmentExpression') {
                    expr = expr.right;
                }
                onExpression(expr);
            });
        },
        ReturnStatement: function (stmt) {
            stmt.argument && onExpression(stmt.argument);
        },
        IfStatement: function (stmt) {
            //stmt.consequent && onBlockOrStmt(stmt.consequent);
            //stmt.alternate && onBlockOrStmt(stmt.alternate);
        },
        WhileStatement: function (stmt) {
            //onBlockOrStmt(stmt.body);
        },
        ForStatement: function (stmt) {
            //onBlockOrStmt(stmt.body);
        },
        ForInStatement: function (stmt) {
            //onBlockOrStmt(stmt.body);
        },
        SwitchStatement: function (stmt) {
            onExpression(stmt.discriminant);
            stmt.cases.forEach(function (switchCase) {
                if (switchCase.test) {
                    onExpression(switchCase.test);
                }
                walkStatements(switchCase.consequent);
            });
        },
        BreakStatement: Noop,
        TryStatement: function (stmt) {
            walkStatements(stmt.block.body);
            stmt.handlers && stmt.handlers.forEach(function (handler) {
                walkStatements(handler.body.body)
            });
            stmt.finalizer && walkStatements(stmt.finalizer.body);
        }
    };

    function onBlockOrStmt(entity) {
        if (entity.type === 'BlockStatement') {
            walkStatements(entity.body);
        } else {
            onStatement(entity);
        }
    }

    var expressionWalkers = {
        CallExpression: function (expr) {
            onExpression(expr.callee);
            expr['arguments'].forEach(onExpression)
        },
        FunctionExpression: function (expr) {
            walkStatements(expr.body.body);
        },
        AssignmentExpression: function (expr) {
            var val = expr.right;
            if (expr.left.type === 'MemberExpression') {
                var propName = expr.left.property.name, comment;
                // find comment
                if (comment = findCommentBefore(expr.range[0])) {
                    // find comment before assign expression
                    onComment(propName, val, comment);
                } else if (comment = findInlineCommentAfter(expr.range[1])) {
                    onComment(propName, val, comment);
                } else if (val.type === 'FunctionExpression' && (comment = findInlineCommentAfter(val.body.range[0] + 1))) {
                    // find comment after function decl
                    onComment(propName, val, comment);
                }
            }
            onExpression(val);
        },
        ArrayExpression: function (expr) {
            expr.elements.forEach(onExpression);
        },
        ObjectExpression: function (expr) {
            expr.properties.forEach(function (prop) {
                // find comment
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
        },
        Identifier: Noop,
        Literal: Noop,
        ThisExpression: Noop,
        MemberExpression: function (expr) {
            onExpression(expr.object);
            onExpression(expr.property);
        },
        UnaryExpression: function (expr) {
            onExpression(expr.argument);
        },
        BinaryExpression: function (expr) {
            onExpression(expr.left);
            onExpression(expr.right);
        },
        ConditionalExpression: function (expr) {
            onExpression(expr.test);
            onExpression(expr.consequent);
            onExpression(expr.alternate);
        },
        UpdateExpression: function (expr) {
            onExpression(expr.argument);
        }
    };

    expressionWalkers.NewExpression = expressionWalkers.CallExpression;
    expressionWalkers.LogicalExpression = expressionWalkers.BinaryExpression;

    function Noop() {
    }

    function onExpression(expr) {
        //console.log('handle expr ' + expr.type);
        if (expr.type in expressionWalkers) {
            expressionWalkers[expr.type](expr);
        } else {
            console.log('TODO: handle expression', expr);
        }
    }

    function onStatement(stmt) {
        //console.log('handle stmt ' + stmt.type);
        if (stmt.type in statementWalkers) {
            statementWalkers[stmt.type](stmt);
        } else {
            console.log('TODO: handle statement', stmt);
        }
    }

    function walkStatements(stmts) {
        stmts.forEach(onStatement);
    }

    walkStatements(program.body);

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
                } else if (obj && (key === 'returns' || key === 'return')) {
                    (obj.params || (obj.params = [])).push({
                        name: '返回',
                        type: mKey[3] || '',
                        desc: value
                    });
                    obj.returns = value
                } else {
                    onUnknownComment(key, value);
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


    function onUnknownComment(key, value) {
        if (key === 'links') {
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
    }

    comments.forEach(function (comment) {
        if (comment.type === TYPE_BLOCK) { // block comment
            var lines = comment.value.replace(rCommentSplitter, '\n').split('\n@');
            lines.some(function (line) {
                var mKey = /(\w+)\s*/.exec(line);
                if (!mKey) return;
                var key = mKey[1], value = line.substr(mKey[0].length + mKey.index);
                if (key === 'config') {
                } else if (key === 'interface') {
                } else {
                    onUnknownComment(key, value);
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
