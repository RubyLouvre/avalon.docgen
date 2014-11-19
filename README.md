avalon.docgen
=============

avalon.oniui的注释文档生成器


### 使用方式

#### 安装

    $ npm install git+https://github.com/RubyLouvre/avalon.docgen.git -g

#### 运行

一、扫描当前目录

    $ avalon-doc --all

扫描当前目录下所有目录，并查找是否存在avalon组件，并生成文档。组件命名规则及生成文件目录格式为：

  - according\
    - avalon.according.js
    - avalon.according.doc.html
  - at\
    - avalon.at.js
    - avalon.at.doc.html

---

二、指定目录

    $ avalon-doc /home/workspace/oniui/at

以指定目录的目录名为组件名，执行生成

---

三、指定输入文件

    $ avalon-doc at/avalon.at.js

#### 例子的生成

当avalon.uiname.js里不存在例子列表注释的时候，则会进入扫描目录逻辑，扫描avalon.uiname.ex[0-9]+.html，并提取其<h[1-2]></h[1-2]>内内容作为title生成例子列表，例如 avalon.tooltip.ex1.html && <h1>接口触发显示</h1> => <a href="avalon.tooltip.ex1.html">接口触发显示</a>

