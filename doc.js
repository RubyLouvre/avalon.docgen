var fs = require("fs")
//用于抽取多行注释,注意第一行需要有两个*
var rcomments = /\/\*\*([\s\S]+?)\*\//img
var a = fs.createReadStream("at.js", {encoding: "utf8"})

var body = "";
a.on("data", function(chunk) {
    body += chunk;
})
a.on("end", function() {
    //收集多行注释
    var sections = []
    body.replace(rcomments, function(_, b) {
        sections.push(b)
        return _
    })
    //元数据对象
    var hash = {}
    //收集@后的元素数据
    sections.forEach(function(text) {
        getAtData(text, hash)
    })
    var trs = hash.trs = []
    for (var i in hash) {
        if (Array.isArray(hash[i]) && i !== "links") {
            trs.push({
                span: paramNames[i]
            })
            trs.push.apply(trs, hash[i])
        }
    }

    console.log(hash)

    fs.createWriteStream('file.txt').write(body, "utf8")

    //console.log(body);
})
var rhasAt = /\@(\w+)/
//从每个符合的多行注释中取得有效的元数据
function getAtData(source, hash) {
    if (rhasAt.test(source)) {
        var lines = source.split(/\r?\n/)
        var paramName
        source = lines.map(function(line) {
            line = line.replace(/^\s*\*/, "")
            if (line.match(rhasAt)) {
                paramName = RegExp.$1
                var paramValue = line.replace(rhasAt, "")
                var hook = dataHooks[paramName]
                hook && hook(paramName, paramValue, hash)
            } else {
                var value = line.trim()
                if (value) {
                    var hook = dataHooks[paramName]
                    hook && hook(paramName, value, hash)
                } else {
                    paramName = void 0
                }
            }
        })
    }
}
function addOne(name, value, hash) {
    if (!hash[name]) {
        hash[name] = value.trim()
    }
}
function addLongText(name, value, hash) {
    if (name in hash) {
        hash[name] = hash[name] + "<br/>" + value.trim()
    } else {
        hash[name] = value.trim()
    }
}
var paramNames = {
    param: "配置项（用户可以调整）",
    innate: "固有接口（用户不可改变）"
}
function addParams(name, value, hash) {
    if (!(name in hash)) {
        hash[name] = []
    }
    var match = value.match(rparamName)
    if (match) {
        var pname = match[0]
        value = value.replace(rparamName, "").replace(/^\s+/, "")
        var array = value.split(";")
        var defaultValue = array.shift()
        var explain = array.join("")
        hash[name].push({
            name: pname,
            defaultValue: defaultValue,
            explain: explain
        })
    } else {
        var array = hash[name]
        var last = array[array.length - 1]
        if (last) {
            last.explain += explain
        }
    }
}

var rlink = /\[([^\]]+)]\((\w+)\)/
var rparamName = /\w+(\([^\)]*\))?/

var dataHooks = {
    cnName: addOne,
    enName: addOne,
    description: addLongText,
    param: addParams,
    innate: addParams,
    links: function(name, value, hash) {
        if (!(name in hash)) {
            hash.links = []
        }
        var match = value.match(rlink)
        if (match) {
            hash.links.push({
                link: match[1],
                text: match[2]
            })
        }
    }
}
/**
 
 添加@cnName, @enName, @description的注释如下，它们一般放在最前，@description比较长，可以跨行，但行与行之间不能存在空行
 /**
 * @cnName avalon类似新浪微博的@提示组件
 * @enName at
 * @description
 *    经常使用微博的人会发现，当我们在输入框输入@然后敲一个人的名字，会弹出一个<code>tip提示层</code>，里面是一个名字列表。
 *    这是社交网站或应用最近非常流行的功能。
 *     当你发布<code>@昵称</code>的信息时，在这里的意思是“向某某人说”，对方能看到你说的话，并能够回复，实现一对一的沟通。
 * /
 
 
 /**
 @param at {"@"} 默认的标识符
 *  /
 at: "@",
 
 添加links的注释为(它一般放在最后)
 /**
 @links 
 [例子1](avalon.at.ex1.html)
 [例子2](avalon.at.ex2.html)
 [例子3](avalon.at.ex3.html)
 * /
 
 
 
 
 */

var ejs = (function() {
//文本，数据，配置项，后项是默认使用<% %>
    var EJS = function(source, data, opts) {
        var fn = EJS.compile(source, opts);
        return fn(data)
    }

//如果第二配置对象指定了tid，则使用它对应的编译模板
    EJS.compile = function(source, opts) {
        opts = opts || {}
        var tid = opts.tid
        if (typeof tid === "string" && typeof EJS.cache[tid] == "function") {
            return EJS.cache[tid];
        }
        var open = opts.open ? "<%" : "<&";
        var close = opts.close ? "%>" : "&>";
        var helperNames = [], helpers = []
        for (var name in opts) {
            if (opts.hasOwnProperty(name) && typeof opts[name] == "function") {
                helperNames.push(name)
                helpers.push(opts[name])
            }
        }
        var flag = true; //判定是否位于前定界符的左边
        var codes = []; //用于放置源码模板中普通文本片断
        var time = new Date * 1; // 时间截,用于构建codes数组的引用变量
        var prefix = " ;r += txt" + time + "[" //渲染函数输出部分的前面
        var postfix = "];"//渲染函数输出部分的后面
        var t = "return function(data){'use strict'; try{var r = '',line" + time + " = 0;"; //渲染函数的最开始部分
        var rAt = /(^|[^\w\u00c0-\uFFFF_])(@)(?=\w)/g;
        var rstr = /(['"])(?:\\[\s\S]|[^\ \\r\n])*?\1/g // /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/
        var rtrim = /(^-|-$)/g;
        var rmass = /mass/
        var js = []
        var pre = 0, cur, code, trim
        for (var i = 0, n = source.length; i < n; ) {
            cur = source.indexOf(flag ? open : close, i);
            if (cur < pre) {
                if (flag) {//取得最末尾的HTML片断
                    t += prefix + codes.length + postfix
                    code = source.slice(pre + close.length);
                    if (trim) {
                        code = code.trim();
                        trim = false;
                    }
                    codes.push(code);
                } else {
                    throw Error("发生错误了");
                }
                break;
            }
            code = source.slice(i, cur); //截取前后定界符之间的片断
            pre = cur;
            if (flag) {//取得HTML片断
                t += prefix + codes.length + postfix;
                if (trim) {
                    code = code.trim();
                    trim = false;
                }
                codes.push(code);
                i = cur + open.length;
            } else {//取得javascript罗辑
                js.push(code)
                t += ";line" + time + "=" + js.length + ";"
                switch (code.charAt(0)) {
                    case "="://直接输出
                        code = code.replace(rtrim, function() {
                            trim = true;
                            return ""
                        });
                        code = code.replace(rAt, "$1data.");
                        if (code.indexOf("|") > 1) {//使用过滤器
                            var arr = [];
                            var str = code.replace(rstr, function(str) {
                                arr.push(str); //先收拾所有字符串字面量
                                return 'mass';
                            }).replace(/\|\|/g, "@"); //再收拾所有短路或
                            if (str.indexOf("|") > 1) {
                                var segments = str.split("|")
                                var filtered = segments.shift().replace(/\@/g, "||").replace(rmass, function() {
                                    return arr.shift();
                                });
                                for (var filter; filter = arr.shift(); ) {
                                    segments = filter.split(":");
                                    name = segments[0];
                                    args = "";
                                    if (segments[1]) {
                                        args = ', ' + segments[1].replace(rmass, function() {
                                            return arr.shift(); //还原
                                        })
                                    }
                                    filtered = "EJS.filters." + name + "(" + filtered + args + ")"
                                }
                                code = "=" + filtered;
                            }
                        }
                        t += " ;r +" + code + ";"
                        break;
                    case "#"://注释,不输出
                        break
                    case "-":
                    default://普通逻辑,不输出
                        code = code.replace(rtrim, function() {
                            trim = true;
                            return "";
                        });
                        t += code.replace(rAt, "$1data.");
                        break;
                }
                i = cur + close.length;
            }
            flag = !flag;
        }
        t += " return r; }catch(e){ EJS.log(e);\nEJS.log(js" + time + "[line" + time + "-1]) }}"
        var body = ["txt" + time, "js" + time, "filters"]
        var fn = Function.apply(Function, body.concat(helperNames, t));
        var args = [codes, js, EJS.filters];
        var compiled = fn.apply(this, args.concat(helpers));
        if (typeof tid === "string") {
            return  EJS.cache[tid] = compiled;
        }
        return compiled;
    }
    EJS.log = function(s) {
        if (typeof console == "object") {
            console.log(s);
        }
    }
    EJS.cache = {}; //用于保存编译好的模板函数
    EJS.filters = {//用于添加各种过滤器
        escape: function(target) {
            return target.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;");
        },
        //还原为可被文档解析的HTML标签
        unescape: function(target) {
            return  target.replace(/&quot;/g, '"')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, "&"); //处理转义的中文和实体字符
            return target.replace(/&#([\d]+);/g, function($0, $1) {
                return String.fromCharCode(parseInt($1, 10));
            });
        }
    };
    return EJS;
})()