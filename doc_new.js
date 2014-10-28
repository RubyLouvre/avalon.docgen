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
    js_beautify = require('./js_beautify').js_beautify;
// end import modules
var tmpl = require('./ejs').compile(fs.readFileSync('template.html', 'utf8'), {
    open: '<%', close: '%>'
});

exports.main = function (path) {
    // read all directories
    fs.readdirSync(path).forEach(function (fileName) {
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

function handleExtension(dir, name) {
    //console.log('parse avalon.' + name + '.js');
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
    // get names from first comment.
    var comments = program.comments, index = 0,
        TYPE_LINE = 'Line', TYPE_BLOCK = 'Block';
    if (!comments.length) {
        return;
    }
    fs.writeFileSync(dir + '/tree.json', JSON.stringify(program));
    var data = {
        cnName: name,
        enName: name,
        introduce: 'TODO: add introduce',
        trs: [],
        links: []
    };
    var firstBlock = comments[0];
    if (firstBlock.type !== TYPE_BLOCK) {
        firstBlock = comments[1];
        index = 1;
    }
    // assert.ok(firstBlock.type === TYPE_BLOCK, 'found block');
    var lines = firstBlock.value.replace(/^\*|[\t ]*\*\s*|\s*\*$/g, '').split('\n@');
    lines.forEach(function (line) {
        var mKey = /(\w+)\s*/.exec(line);
        if (mKey) {
            data[mKey[1]] = line.substr(mKey[0].length);
        }
    });

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
                        if (expr.left.type === 'MemberExpression' && expr.left.object.name === 'widget' && expr.left.property.name === 'defaults') {
                            var rval = expr.right;
                            while (rval.type === 'AssignmentExpression') {
                                rval = rval.right;
                            }
                            if (rval.type === 'ObjectExpression') {
                                onAssignWidgetDefaults(rval.properties);
                            }
                        }
                    }
                });
            }
            return true; // End program.body.some()
        }
    });

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
                var rval = expr.right;
                while (rval.type === 'AssignmentExpression') {
                    rval = rval.right;
                }
                var comment;
                // find comment
                if (comment = findCommentBefore(stmt.range[0])) {
                    // find comment before assign expression
                    onComment(expr.left.property.name, rval, comment);
                } else if (rval.type === 'FunctionExpression' && (comment = findInlineCommentAfter(rval.body.range[0] + 1))) {
                    // find comment after function decl
                    onComment(expr.left.property.name, rval, comment);
                }
            }
        });
    }

    function onAssignWidgetDefaults(properties) {
        properties.forEach(function (prop) {
            // find comment
            //console.log('find comment for ' + prop.key.name, prop.range);
            var comment;
            if (comment = findCommentBefore(prop.range[0])) {
                onComment(prop.key.name, prop.value, comment);
            } else {
                var propEnd = prop.range[1],
                    m = /\s*,/.exec(content.substr(propEnd));
                if (m) {
                    propEnd += m[0].length;
                }
                if (comment = findInlineCommentAfter(propEnd)) {
                    onComment(prop.key.name, prop.value, comment);
                }
            }

        });
    }

    function onComment(name, expr, comment) {
        //console.log(name, expr, comment);
        var defaultVal;
        if (expr.type === 'FunctionExpression') {
            defaultVal = 'function(' + expr.params.map(function (param) {
                return param.name
            }).join() + '){...}'
        } else {
            defaultVal = content.substring(expr.range[0], expr.range[1])
        }

        if (comment.type === TYPE_BLOCK) {
            comment.value.replace(/^\*|[\t ]*\*\s*|[\t ]*\*$/g, '').split('\n@').some(function (line) {
                var mKey = /(\w+)\s*/.exec(line);
                if (!mKey) return;
                var key = mKey[1], value = line.substr(mKey[0].length);
                if (key === 'config') {
                    configs.push({
                        name: name,
                        defaultValue: defaultVal,
                        explain: value
                    });
                    return true;
                } else if (key === 'interface' && expr.type === 'FunctionExpression') {
                    interfaces.push({
                        name: name + '(' + expr.params.map(function (param) {
                            return param.name
                        }).join() + ')',
                        defaultValue: '',
                        explain: value
                    });
                    return true;
                }
            })

        } else {
            var mKey;
            if (mKey = /^\s*@(config|interface)\s/.exec(comment.value)) {
                var key = mKey[1], value = comment.value.substr(mKey[0].length);
                if (key === 'config') {  // single line config
                    configs.push({
                        name: name,
                        defaultValue: defaultVal,
                        explain: value
                    });
                } else if (expr.type === 'FunctionExpression') {
                    interfaces.push({
                        name: name + '(' + expr.params.map(function (param) {
                            return param.name
                        }).join() + ')',
                        defaultValue: '',
                        explain: value
                    })
                }
            }
        }
    }

    function findCommentBefore(before) { //TODO: binary search
        for (var i = 0, L = comments.length - 1; i < L; i++) {
            if (comments[i].range[1] > before) break;
        }
        var comment = comments[i - 1];
        if (comment && !content.substring(comment.range[1], before).trim()) {
            // only blank
            comments.splice(i, 1);
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
            var lines = comment.value.replace(/^\*|[\t ]*\*\s*|\s*\*$/g, '').split('\n@');
            lines.some(function (line) {
                var mKey = /(\w+)\s*/.exec(line);
                if (!mKey) return;
                var key = mKey[1], value = line.substr(mKey[0].length);
                if (key === 'config') {
                } else if (key === 'interface') {
                } else { // others
                    data[key] = filterValue(value);
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
    var result = tmpl(data);
    fs.writeFile(dir + '/avalon.' + name + '.doc.new.html', result);
    //console.log(tmpl(data));

    function filterValue(value) {
        return value.replace(/```(\w+)?\n([\w\W]*?)```/g, function (m, lang, content) {
            if (lang === 'js')lang = 'javascript';
            if (lang === 'html') {
                //TODO: escape html
            } else if (lang === 'javascript') {
                // beautify
                content = js_beautify(content);
            }
            return '<pre class="brush:' + lang + ';gutter:false;toolbar:false;">' + content + '</pre>';
        });
    }
}

if (process.mainModule === module) {
    exports.main(".");
}