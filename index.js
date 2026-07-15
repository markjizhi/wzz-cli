#!/usr/bin/env node

/**
 * 文转赚 CLI 发布工具
 *
 * 用法：
 *   node index.js list                    查看分类和专栏列表
 *   node index.js publish article.md      发布文章
 *   node index.js publish article.md --dry-run  预览不实际发布
 *   node index.js help                    显示帮助
 */

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');

// 加载配置
var configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.log('错误：配置文件不存在，请先创建 config.json');
    console.log('参考 config.example.json');
    process.exit(1);
}

var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 凭据文件路径
var credentialsPath = path.join(__dirname, '.credentials');

// 解析命令
var args = process.argv.slice(2);
var command = args[0] || 'help';

switch (command) {
    case 'login':
        doLogin(function() { process.exit(0); });
        break;
    case 'logout':
        cmdLogout();
        break;
    case 'list':
        ensureLoggedIn(function() { cmdList(); });
        break;
    case 'publish':
        var file = args[1] || '';
        var dryRun = args.indexOf('--dry-run') > -1;
        var categoryArg = getArgValue(args, '--category');
        var columnArg = getArgValue(args, '--column');
        if (!file) {
            console.log('错误：请指定Markdown文件路径');
            console.log('用法：node index.js publish article.md');
            process.exit(1);
        }
        if (dryRun) {
            cmdPublish(file, dryRun, categoryArg, columnArg);
        } else {
            ensureLoggedIn(function() { cmdPublish(file, dryRun, categoryArg, columnArg); });
        }
        break;
    case 'edit':
        var editFile = args[1] || '';
        var editId = getArgValue(args, '--id');
        var editCategoryArg = getArgValue(args, '--category');
        var editColumnArg = getArgValue(args, '--column');
        if (!editFile) {
            console.log('错误：请指定Markdown文件路径');
            console.log('用法：wzz edit article.md --id <文章ID>');
            process.exit(1);
        }
        ensureLoggedIn(function() { cmdEdit(editFile, editId, editCategoryArg, editColumnArg); });
        break;
    case 'column':
        var columnId = args[1] || '';
        if (!columnId) {
            console.log('错误：请指定专栏ID');
            console.log('用法：wzz column <专栏ID>');
            process.exit(1);
        }
        ensureLoggedIn(function() { cmdColumnArticles(columnId); });
        break;
    case 'article':
        var artId = args[1] || '';
        if (!artId) {
            console.log('错误：请指定文章ID');
            console.log('用法：wzz article <文章ID> [--md]');
            process.exit(1);
        }
        var exportMd = args.indexOf('--md') > -1;
        ensureLoggedIn(function() { cmdArticleDetail(artId, exportMd); });
        break;
    case 'help':
    default:
        cmdHelp();
        break;
}

// 解析命令行参数值
function getArgValue(args, name) {
    var idx = args.indexOf(name);
    if (idx > -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return '';
}

// ============================================================
// 命令实现
// ============================================================

function cmdHelp() {
    console.log('文转赚 CLI 发布工具');
    console.log('====================\n');
    console.log('用法：');
    console.log('  wzz login                                  登录授权（打开浏览器确认）');
    console.log('  wzz list                                   查看分类和专栏列表');
    console.log('  wzz publish <file>                         发布文章（交互式选择分类/专栏）');
    console.log('  wzz publish <file> --category <id> --column <id>   指定分类和专栏发布');
    console.log('  wzz publish <file> --dry-run               预览模式，不实际发布');
    console.log('  wzz edit <file> --id <文章ID>              修改已发布的文章（全量替换）');
    console.log('  wzz edit <file> --id <ID> --category <id> --column <id>   指定分类和专栏修改');
    console.log('  wzz column <专栏ID>                        查看专栏下的文章列表');
    console.log('  wzz article <文章ID>                       查看文章详情');
    console.log('  wzz article <文章ID> --md                  导出文章为Markdown文件');
    console.log('  wzz logout                                 退出登录');
    console.log('  wzz help                                   显示帮助\n');
    console.log('AI助手调用说明：');
    console.log('  1. 首次使用先执行 wzz login，等待用户在浏览器确认授权');
    console.log('  2. 执行 wzz list 获取分类ID和专栏ID');
    console.log('  3. 使用 --category 和 --column 参数非交互式发布：');
    console.log('     wzz publish "/path/to/article.md" --category <分类ID> --column <专栏ID>');
    console.log('  4. 修改文章：');
    console.log('     wzz edit "/path/to/article.md" --id <文章ID> --category <分类ID> --column <专栏ID>');
    console.log('  5. 路径包含空格时必须用引号包裹');
    console.log('  6. 建议先 --dry-run 预览确认再正式发布\n');
    console.log('Markdown文件格式：');
    console.log('  支持frontmatter（title, category, column, pay_money, status, author, thumb, article_id）');
    console.log('  正文中的图片 ![](path) 会自动上传，第一张图自动作为缩略图');
    console.log('  没有frontmatter时自动从正文#标题提取文章标题');
    console.log('  编辑时可在frontmatter中写 article_id 代替 --id 参数\n');
}

function doLogin(callback) {
    console.log('== 文转赚 CLI 登录 ==\n');
    console.log('正在生成授权链接...');

    apiRequest('cli_auth_start', null, function(err, result) {
        if (err || !result || result.errno !== 0) {
            console.log('失败：' + (result ? result.message : err));
            process.exit(1);
        }

        var code = result.data.code;
        var authUrl = result.data.auth_url;

        console.log('正在打开浏览器进行授权...\n');
        console.log('如果浏览器没有自动打开，请手动访问：');
        console.log('  ' + authUrl + '\n');

        openBrowser(authUrl);

        // 轮询等待授权
        var maxWait = 150; // 最多等5分钟（150次 * 2秒）
        var waited = 0;

        process.stdout.write('等待授权中');

        var pollInterval = setInterval(function() {
            waited++;
            process.stdout.write('.');

            if (waited >= maxWait) {
                clearInterval(pollInterval);
                console.log('\n\n等待超时，请重试');
                process.exit(1);
            }

            apiRequest('cli_auth_check', { code: code }, function(err2, check) {
                if (err2 || !check) return;

                if (check.errno === 0) {
                    // 授权成功
                    clearInterval(pollInterval);
                    console.log('\n\n授权成功！欢迎 ' + check.data.username);

                    var accounts = check.data.accounts || [];
                    var uniacid = 0;

                    if (accounts.length === 1) {
                        uniacid = accounts[0].uniacid;
                        console.log('自动选择账号 uniacid: ' + uniacid);
                        saveAndFinish(check.data, uniacid, callback);
                    } else if (accounts.length > 1) {
                        console.log('\n可用账号：');
                        accounts.forEach(function(acc, i) {
                            console.log('  [' + (i + 1) + '] uniacid: ' + acc.uniacid + ' (角色: ' + acc.role + ')');
                        });

                        var readline = require('readline');
                        var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                        rl.question('请选择 [1-' + accounts.length + ']: ', function(answer) {
                            var choice = parseInt(answer);
                            if (choice >= 1 && choice <= accounts.length) {
                                uniacid = accounts[choice - 1].uniacid;
                            } else {
                                uniacid = accounts[0].uniacid;
                            }
                            rl.close();
                            console.log('已选择 uniacid: ' + uniacid);
                            saveAndFinish(check.data, uniacid, callback);
                        });
                    } else {
                        var readline = require('readline');
                        var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                        rl.question('未找到关联账号，请输入uniacid: ', function(answer) {
                            uniacid = parseInt(answer) || 0;
                            rl.close();
                            saveAndFinish(check.data, uniacid, callback);
                        });
                    }
                } else if (check.errno === -2) {
                    clearInterval(pollInterval);
                    console.log('\n\n授权码已过期，请重试');
                    process.exit(1);
                }
                // errno === 1 是pending，继续等
            });
        }, 2000);
    });
}

function saveAndFinish(data, uniacid, callback) {
    var credentials = {
        token: data.token,
        username: data.username,
        uid: data.uid,
        uniacid: uniacid
    };
    saveCredentials(credentials);
    console.log('\n登录完成，可以开始使用了！');
    if (callback) {
        callback();
    }
}

function cmdLogout() {
    if (fs.existsSync(credentialsPath)) {
        fs.unlinkSync(credentialsPath);
        console.log('已退出登录');
    } else {
        console.log('当前未登录');
    }
}

function ensureLoggedIn(callback) {
    var cred = loadCredentials();
    if (cred && cred.token) {
        callback();
    } else {
        console.log('检测到未登录，自动进入授权流程...\n');
        doLogin(callback);
    }
}

function saveCredentials(data) {
    fs.writeFileSync(credentialsPath, JSON.stringify(data, null, 2));
    fs.chmodSync(credentialsPath, 0600);
}

function loadCredentials() {
    if (!fs.existsSync(credentialsPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } catch (e) {
        return null;
    }
}

// 最近使用的专栏记录
var recentColumnPath = path.join(__dirname, '.recent_column');

function loadRecentColumn() {
    if (!fs.existsSync(recentColumnPath)) return 0;
    try {
        return parseInt(fs.readFileSync(recentColumnPath, 'utf8').trim()) || 0;
    } catch (e) {
        return 0;
    }
}

function saveRecentColumn(columnId) {
    var p = path.join(__dirname, '.recent_column');
    fs.writeFileSync(p, String(columnId));
}

function openBrowser(url) {
    var cmd;
    switch (process.platform) {
        case 'darwin': cmd = 'open'; break;
        case 'win32': cmd = 'start'; break;
        default: cmd = 'xdg-open'; break;
    }
    require('child_process').exec(cmd + ' ' + JSON.stringify(url));
}

function cmdList() {
    apiRequest('cli_list', null, function(err, result) {
        if (err || result.errno !== 0) {
            console.log('请求失败：' + (result ? result.message : err));
            process.exit(1);
        }

        var categories = result.data.categories;
        var columns = result.data.columns;

        console.log('\n== 文章分类 ==');
        console.log(padStr('ID', 6) + padStr('名称', 30));
        console.log(repeat('-', 36));
        categories.forEach(function(row) {
            console.log(padStr(row.id, 6) + row.name);
        });

        console.log('\n== 专栏列表 ==');
        console.log(padStr('ID', 6) + padStr('名称', 30) + padStr('状态', 10));
        console.log(repeat('-', 46));
        columns.forEach(function(row) {
            var status = row.status == 1 ? '显示' : '隐藏';
            console.log(padStr(row.id, 6) + padStr(row.name, 30) + status);
        });
        console.log('');
    });
}

function cmdPublish(file, dryRun, categoryArg, columnArg) {
    // 解析Markdown文件
    var filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
        console.log('错误：文件不存在 - ' + file);
        process.exit(1);
    }

    var content = fs.readFileSync(filePath, 'utf8');
    var baseDir = path.dirname(filePath);

    // 解析frontmatter
    var parsed = parseFrontmatter(content);
    var meta = parsed.meta;
    var body = parsed.body;

    var title = meta.title || '';
    var payMoney = meta.pay_money || config.defaults.pay_money;
    var status = meta.status !== undefined ? parseInt(meta.status) : config.defaults.status;
    var author = meta.author || config.defaults.author || '';
    var thumb = meta.thumb || '';

    // 自动推断标题：frontmatter > 正文开头的#标题 > 文件名
    if (!title) {
        // 移除正文开头所有连续的一级标题行，取最后一个作为标题
        var headingRemoved = true;
        while (headingRemoved) {
            var titleMatch = body.match(/^\s*#+\s+(.+)$/m);
            if (titleMatch && body.indexOf(titleMatch[0]) === body.search(/\S/)) {
                title = titleMatch[1].trim();
                body = body.substring(body.indexOf(titleMatch[0]) + titleMatch[0].length).replace(/^\s*\n/, '');
            } else {
                headingRemoved = false;
            }
        }
        body = body.trim();
        if (!title) {
            title = path.basename(filePath, path.extname(filePath));
        }
    } else {
        // 有frontmatter title时，移除正文开头与title重复的标题行
        var removing = true;
        while (removing) {
            var hMatch = body.match(/^\s*#+\s+(.+)$/m);
            if (hMatch && body.indexOf(hMatch[0]) === body.search(/\S/)) {
                body = body.substring(body.indexOf(hMatch[0]) + hMatch[0].length).replace(/^\s*\n/, '');
            } else {
                removing = false;
            }
        }
        body = body.trim();
    }

    // 解析正文为组件
    var segments = parseBody(body);

    if (dryRun) {
        console.log('准备发布文章：' + title);
        console.log('  价格: ' + payMoney);
        console.log('  状态: ' + (status == 1 ? '上架' : '下架') + '\n');
        console.log('解析到 ' + segments.length + ' 个内容段：');
        segments.forEach(function(seg, i) {
            if (seg.type === 'text') {
                var preview = stripTags(seg.content).substring(0, 40);
                console.log('  [' + (i + 1) + '] 文本: ' + preview + '...');
            } else {
                console.log('  [' + (i + 1) + '] 图片: ' + seg.path);
            }
        });
        console.log('\n[预览模式] 不实际发布，退出。');
        process.exit(0);
    }

    // 非交互模式：如果指定了 --category 则跳过选择
    if (categoryArg) {
        var category = parseInt(categoryArg);
        var column = parseInt(columnArg) || 0;

        console.log('使用指定分类ID: ' + category);
        console.log('使用指定专栏ID: ' + column + '\n');

        if (column) {
            saveRecentColumn(column);
        }

        // 如果原文件没有frontmatter，自动写入
        if (!parsed.hasFrontmatter) {
            var fm = '---\n';
            fm += 'title: "' + title + '"\n';
            fm += 'category: ' + category + '\n';
            fm += 'column: ' + column + '\n';
            fm += 'pay_money: ' + payMoney + '\n';
            fm += 'status: ' + status + '\n';
            if (author) fm += 'author: "' + author + '"\n';
            if (thumb) fm += 'thumb: "' + thumb + '"\n';
            fm += '---\n\n';
            fs.writeFileSync(filePath, fm + content);
            console.log('已自动为文章添加 frontmatter\n');
        }

        doPublishUpload(title, category, column, payMoney, status, author, thumb, segments, baseDir);
        return;
    }

    // 交互模式：从API获取分类和专栏列表，让用户选择
    console.log('正在获取分类和专栏列表...\n');
    apiRequest('cli_list', null, function(err, result) {
        if (err || !result || result.errno !== 0) {
            console.log('获取列表失败：' + (result ? result.message : err));
            process.exit(1);
        }

        var categories = result.data.categories;
        var columns = result.data.columns;
        var recentColumnId = loadRecentColumn();

        // 专栏排序：最近使用的排前面
        if (recentColumnId) {
            columns.sort(function(a, b) {
                if (a.id == recentColumnId) return -1;
                if (b.id == recentColumnId) return 1;
                return 0;
            });
        }

        var readline = require('readline');
        var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        // 显示分类列表
        console.log('== 请选择文章分类 ==');
        categories.forEach(function(row, i) {
            console.log('  [' + (i + 1) + '] ' + row.name + ' (ID: ' + row.id + ')');
        });

        rl.question('\n请选择分类 [1-' + categories.length + ']: ', function(catAnswer) {
            var catChoice = parseInt(catAnswer);
            if (catChoice < 1 || catChoice > categories.length) {
                console.log('无效选择，退出');
                rl.close();
                process.exit(1);
            }
            var category = categories[catChoice - 1].id;
            console.log('已选择分类: ' + categories[catChoice - 1].name + '\n');

            // 显示专栏列表
            console.log('== 请选择专栏 ==');
            var visibleColumns = columns.filter(function(row) { return row.status == 1; });
            visibleColumns.forEach(function(row, i) {
                var label = '  [' + (i + 1) + '] ' + row.name + ' (ID: ' + row.id + ')';
                if (row.id == recentColumnId) label += ' [最近使用]';
                console.log(label);
            });
            console.log('  [0] 不加入专栏');

            rl.question('\n请选择专栏 [0-' + visibleColumns.length + ']' + (recentColumnId ? ' (回车默认最近使用)' : '') + ': ', function(colAnswer) {
                var column = 0;
                if (colAnswer === '' && recentColumnId) {
                    column = recentColumnId;
                } else {
                    var colChoice = parseInt(colAnswer);
                    if (colChoice >= 1 && colChoice <= visibleColumns.length) {
                        column = visibleColumns[colChoice - 1].id;
                    }
                }

                if (column) {
                    var colName = '';
                    visibleColumns.forEach(function(c) { if (c.id == column) colName = c.name; });
                    console.log('已选择专栏: ' + colName + '\n');
                    saveRecentColumn(column);
                } else {
                    console.log('不加入专栏\n');
                }

                rl.close();

                // 如果原文件没有frontmatter，自动写入
                if (!parsed.hasFrontmatter) {
                    var fm = '---\n';
                    fm += 'title: "' + title + '"\n';
                    fm += 'category: ' + category + '\n';
                    fm += 'column: ' + column + '\n';
                    fm += 'pay_money: ' + payMoney + '\n';
                    fm += 'status: ' + status + '\n';
                    if (author) fm += 'author: "' + author + '"\n';
                    if (thumb) fm += 'thumb: "' + thumb + '"\n';
                    fm += '---\n\n';
                    fs.writeFileSync(filePath, fm + content);
                    console.log('已自动为文章添加 frontmatter\n');
                }

                // 继续发布流程
                doPublishUpload(title, category, column, payMoney, status, author, thumb, segments, baseDir);
            });
        });
    });
}

function doPublishUpload(title, category, column, payMoney, status, author, thumb, segments, baseDir) {
    console.log('准备发布文章：' + title);
    console.log('  分类ID: ' + category);
    console.log('  专栏ID: ' + column);
    console.log('  价格: ' + payMoney);
    console.log('  状态: ' + (status == 1 ? '上架' : '下架'));
    console.log('  内容段数: ' + segments.length + '\n');

    console.log('开始上传图片...');

    // 收集所有需要上传的图片
    var uploadTasks = [];

    if (thumb) {
        var thumbPath = resolvePath(thumb, baseDir);
        if (fs.existsSync(thumbPath)) {
            uploadTasks.push({ type: 'thumb', path: thumbPath });
        } else {
            console.log('  警告：缩略图文件不存在 - ' + thumbPath);
        }
    }

    segments.forEach(function(seg, i) {
        if (seg.type === 'image') {
            // 远程URL直接使用，不需要上传
            if (seg.path && seg.path.match(/^https?:\/\//)) {
                seg.url = seg.path;
            } else {
                var imgPath = resolvePath(seg.path, baseDir);
                if (fs.existsSync(imgPath)) {
                    uploadTasks.push({ type: 'image', index: i, path: imgPath });
                } else {
                    console.log('  警告：图片不存在 - ' + imgPath + '，跳过');
                }
            }
        }
    });

    // 按顺序上传图片
    var thumbUrl = '';
    var firstImageUrl = '';
    var uploadIndex = 0;

    function processNextUpload() {
        if (uploadIndex >= uploadTasks.length) {
            // 全部上传完成，开始发布
            doPublish();
            return;
        }

        var task = uploadTasks[uploadIndex];
        uploadImage(task.path, function(err, imgUrl) {
            if (err || !imgUrl) {
                console.log('  警告：图片上传失败 - ' + path.basename(task.path));
            } else {
                console.log('  上传成功: ' + path.basename(task.path) + ' -> ' + imgUrl);
                if (task.type === 'thumb') {
                    thumbUrl = imgUrl;
                } else {
                    segments[task.index].url = imgUrl;
                    if (!firstImageUrl) {
                        firstImageUrl = imgUrl;
                    }
                }
            }
            uploadIndex++;
            processNextUpload();
        });
    }

    function doPublish() {
        // 如果没设缩略图，用第一张图
        if (!thumbUrl && firstImageUrl) {
            thumbUrl = firstImageUrl;
            console.log('  自动使用第一张图片作为缩略图');
        }

        // 构建content JSON
        var items = [];
        segments.forEach(function(seg) {
            if (seg.type === 'text') {
                items.push(buildRichtextItem(seg.content));
            } else if (seg.type === 'image' && seg.url) {
                items.push(buildPictureItem(seg.url));
            } else if (seg.type === 'video' && seg.url) {
                items.push(buildVideoItem(seg.url));
            }
        });

        var contentJson = JSON.stringify({ items: items });

        // 调用发布API
        console.log('\n正在发布...');
        console.log('  内容items数: ' + items.length);
        console.log('  content JSON长度: ' + contentJson.length);
        var publishData = {
            title: title,
            category: category,
            column: column,
            types: config.defaults.types,
            pay_money: payMoney,
            content: contentJson,
            thumb: thumbUrl,
            author: author,
            status: status
        };

        apiRequest('cli_publish', publishData, function(err, result) {
            if (err) {
                console.log('\n发布失败：' + err);
                process.exit(1);
            }
            if (result.errno === 0) {
                console.log('\n发布成功！文章ID: ' + result.data.article_id);
                if (column) {
                    console.log('已添加到专栏: ' + column);
                }
                console.log('\n完成！');
            } else {
                console.log('\n发布失败：' + result.message);
                process.exit(1);
            }
        });
    }

    processNextUpload();
}

function cmdEdit(file, articleId, categoryArg, columnArg) {
    var filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
        console.log('错误：文件不存在 - ' + file);
        process.exit(1);
    }

    var content = fs.readFileSync(filePath, 'utf8');
    var baseDir = path.dirname(filePath);

    // 解析frontmatter
    var parsed = parseFrontmatter(content);
    var meta = parsed.meta;
    var body = parsed.body;

    // 文章ID：命令行参数 > frontmatter
    var id = articleId ? parseInt(articleId) : (meta.article_id ? parseInt(meta.article_id) : 0);
    if (!id) {
        console.log('错误：请指定文章ID');
        console.log('用法：wzz edit article.md --id <文章ID>');
        console.log('  或在frontmatter中添加 article_id: <ID>');
        process.exit(1);
    }

    var title = meta.title || '';
    var payMoney = meta.pay_money || config.defaults.pay_money;
    var status = meta.status !== undefined ? parseInt(meta.status) : config.defaults.status;
    var author = meta.author || config.defaults.author || '';
    var thumb = meta.thumb || '';
    var category = categoryArg ? parseInt(categoryArg) : (meta.category ? parseInt(meta.category) : 0);
    var column = columnArg ? parseInt(columnArg) : (meta.column ? parseInt(meta.column) : 0);

    // 推断标题
    if (!title) {
        var headingRemoved = true;
        while (headingRemoved) {
            var titleMatch = body.match(/^\s*#+\s+(.+)$/m);
            if (titleMatch && body.indexOf(titleMatch[0]) === body.search(/\S/)) {
                title = titleMatch[1].trim();
                body = body.substring(body.indexOf(titleMatch[0]) + titleMatch[0].length).replace(/^\s*\n/, '');
            } else {
                headingRemoved = false;
            }
        }
        body = body.trim();
        if (!title) {
            title = path.basename(filePath, path.extname(filePath));
        }
    } else {
        var removing = true;
        while (removing) {
            var hMatch = body.match(/^\s*#+\s+(.+)$/m);
            if (hMatch && body.indexOf(hMatch[0]) === body.search(/\S/)) {
                body = body.substring(body.indexOf(hMatch[0]) + hMatch[0].length).replace(/^\s*\n/, '');
            } else {
                removing = false;
            }
        }
        body = body.trim();
    }

    if (!category) {
        console.log('错误：分类不能为空，请通过 --category 指定或在frontmatter中设置');
        process.exit(1);
    }

    var segments = parseBody(body);

    console.log('准备更新文章 #' + id + '：' + title);
    console.log('  分类ID: ' + category);
    console.log('  专栏ID: ' + column);
    console.log('  价格: ' + payMoney);
    console.log('  状态: ' + (status == 1 ? '上架' : '下架'));
    console.log('  内容段数: ' + segments.length + '\n');

    console.log('开始上传图片...');

    // 收集图片上传任务
    var uploadTasks = [];
    if (thumb) {
        var thumbPath = resolvePath(thumb, baseDir);
        if (fs.existsSync(thumbPath)) {
            uploadTasks.push({ type: 'thumb', path: thumbPath });
        } else {
            // thumb可能是已上传的远程路径，保留
        }
    }

    segments.forEach(function(seg, i) {
        if (seg.type === 'image') {
            // 远程URL直接使用，不需要上传
            if (seg.path && seg.path.match(/^https?:\/\//)) {
                seg.url = seg.path;
            } else {
                var imgPath = resolvePath(seg.path, baseDir);
                if (fs.existsSync(imgPath)) {
                    uploadTasks.push({ type: 'image', index: i, path: imgPath });
                } else {
                    console.log('  警告：图片不存在 - ' + imgPath + '，跳过');
                }
            }
        }
    });

    var thumbUrl = '';
    var firstImageUrl = '';
    var uploadIndex = 0;

    // 如果thumb不是本地文件，可能已经是远程路径
    if (thumb && !fs.existsSync(resolvePath(thumb, baseDir))) {
        thumbUrl = thumb;
    }

    function processNextUpload() {
        if (uploadIndex >= uploadTasks.length) {
            doUpdate();
            return;
        }

        var task = uploadTasks[uploadIndex];
        uploadImage(task.path, function(err, imgUrl) {
            if (err || !imgUrl) {
                console.log('  警告：图片上传失败 - ' + path.basename(task.path));
            } else {
                console.log('  上传成功: ' + path.basename(task.path) + ' -> ' + imgUrl);
                if (task.type === 'thumb') {
                    thumbUrl = imgUrl;
                } else {
                    segments[task.index].url = imgUrl;
                    if (!firstImageUrl) {
                        firstImageUrl = imgUrl;
                    }
                }
            }
            uploadIndex++;
            processNextUpload();
        });
    }

    function doUpdate() {
        if (!thumbUrl && firstImageUrl) {
            thumbUrl = firstImageUrl;
            console.log('  自动使用第一张图片作为缩略图');
        }

        var items = [];
        segments.forEach(function(seg) {
            if (seg.type === 'text') {
                items.push(buildRichtextItem(seg.content));
            } else if (seg.type === 'image' && seg.url) {
                items.push(buildPictureItem(seg.url));
            } else if (seg.type === 'video' && seg.url) {
                items.push(buildVideoItem(seg.url));
            }
        });

        var contentJson = JSON.stringify({ items: items });

        console.log('\n正在更新...');
        var updateData = {
            article_id: id,
            title: title,
            category: category,
            column: column,
            types: config.defaults.types,
            pay_money: payMoney,
            content: contentJson,
            thumb: thumbUrl,
            author: author,
            status: status
        };

        apiRequest('cli_update', updateData, function(err, result) {
            if (err) {
                console.log('\n更新失败：' + err);
                process.exit(1);
            }
            if (result.errno === 0) {
                console.log('\n更新成功！文章ID: ' + result.data.article_id);
                console.log('\n完成！');
            } else {
                console.log('\n更新失败：' + result.message);
                process.exit(1);
            }
        });
    }

    processNextUpload();
}

function cmdColumnArticles(columnId) {
    console.log('正在查询专栏 #' + columnId + ' 的文章列表...\n');

    apiRequest('cli_column_articles&column_id=' + columnId, null, function(err, result) {
        if (err || !result || result.errno !== 0) {
            console.log('查询失败：' + (result ? result.message : err));
            process.exit(1);
        }

        var data = result.data;
        console.log('专栏：' + data.column_name + ' (ID: ' + data.column_id + ')');
        console.log('文章数：' + data.count + '\n');

        if (data.count === 0) {
            console.log('该专栏下暂无文章');
            return;
        }

        console.log(padStr('ID', 8) + padStr('标题', 40) + padStr('状态', 8) + '更新时间');
        console.log(repeat('-', 70));
        data.articles.forEach(function(article) {
            var statusText = article.status == 2 ? '显示' : '隐藏';
            var updateTime = formatTime(article.updatetime);
            console.log(padStr(article.id, 8) + padStr(article.title, 40) + padStr(statusText, 8) + updateTime);
        });
        console.log('');
    });
}

function cmdArticleDetail(articleId, exportMd) {
    console.log('正在查询文章 #' + articleId + ' ...\n');

    apiRequest('cli_article_detail&article_id=' + articleId, null, function(err, result) {
        if (err || !result || result.errno !== 0) {
            console.log('查询失败：' + (result ? result.message : err));
            process.exit(1);
        }

        var d = result.data;
        console.log('== 文章详情 ==');
        console.log('  ID:       ' + d.id);
        console.log('  标题:     ' + d.title);
        console.log('  分类:     ' + d.category_name + ' (ID: ' + d.category + ')');
        console.log('  专栏:     ' + (d.column_id ? d.column_name + ' (ID: ' + d.column_id + ')' : '无'));
        console.log('  类型:     ' + (['', '图文', '图', '音频', '视频'][d.types] || d.types));
        console.log('  价格:     ' + d.pay_money);
        console.log('  状态:     ' + (d.status == 2 ? '显示' : '隐藏'));
        console.log('  缩略图:   ' + (d.thumb || '无'));
        console.log('  作者:     ' + (d.author || '无'));
        console.log('  内容组件: ' + d.content_items + ' 个');
        console.log('  创建时间: ' + formatTime(d.createtime));
        console.log('  更新时间: ' + formatTime(d.updatetime));
        console.log('');

        if (exportMd && d.content) {
            var md = generateArticleMarkdown(d);
            var filename = 'article_' + d.id + '.md';
            fs.writeFileSync(filename, md, 'utf8');
            console.log('已导出到: ' + path.resolve(filename));
        }
    });
}

// 将文章数据转为完整的 Markdown 文件内容
function generateArticleMarkdown(data) {
    var lines = [];
    // frontmatter
    lines.push('---');
    lines.push('title: "' + (data.title || '').replace(/"/g, '\\"') + '"');
    lines.push('article_id: ' + data.id);
    lines.push('category: ' + data.category);
    if (data.column_id) lines.push('column: ' + data.column_id);
    if (data.pay_money && data.pay_money !== '0.00') lines.push('pay_money: ' + data.pay_money);
    if (data.author) lines.push('author: "' + data.author.replace(/"/g, '\\"') + '"');
    if (data.thumb) lines.push('thumb: "' + data.thumb + '"');
    lines.push('status: ' + data.status);
    lines.push('---');
    lines.push('');

    // 正文内容
    if (data.content && typeof data.content === 'object') {
        var keys = Object.keys(data.content);
        keys.forEach(function(key) {
            var component = data.content[key];
            var block = convertComponent(component);
            if (block) {
                lines.push(block);
                lines.push('');
            }
        });
    }

    return lines.join('\n');
}

// 将单个组件转为 Markdown
function convertComponent(component) {
    var id = component.id;
    switch (id) {
        case 'richtext':
            return convertRichtext(component);
        case 'picture':
            return convertPicture(component);
        case 'video':
            return convertVideo(component);
        case 'goods':
            return convertGoods(component);
        default:
            return '> [' + id + ' 组件]';
    }
}

function convertRichtext(component) {
    var raw = component.params && component.params.content;
    if (!raw) return '';
    var html = Buffer.from(raw, 'base64').toString('utf8');
    return htmlToMarkdown(html);
}

function convertPicture(component) {
    var dataObj = component.data;
    if (!dataObj) return '';
    var lines = [];
    var keys = Object.keys(dataObj);
    keys.forEach(function(k) {
        var item = dataObj[k];
        if (item && item.imgurl) {
            var imgUrl = item.imgurl;
            if (imgUrl && !imgUrl.match(/^https?:\/\//)) {
                imgUrl = config.site_url + '/attachment/' + imgUrl;
            }
            lines.push('![图片](' + imgUrl + ')');
        }
    });
    return lines.join('\n');
}

function convertVideo(component) {
    var params = component.params;
    if (params && params.videourl) {
        return '[视频](' + params.videourl + ')';
    }
    if (params && params.video) {
        return '[视频](' + params.video + ')';
    }
    return '> [视频组件]';
}

function convertGoods(component) {
    var dataObj = component.data;
    if (!dataObj) return '> [商品组件]';
    var lines = ['> **商品推荐：**'];
    var keys = Object.keys(dataObj);
    keys.forEach(function(k) {
        var item = dataObj[k];
        if (item) {
            var title = item.title || item.goodstitle || '商品';
            var price = item.price || item.goodsprice || '';
            lines.push('> - ' + title + (price ? '（¥' + price + '）' : ''));
        }
    });
    return lines.join('\n');
}

// 简易 HTML 转 Markdown
function htmlToMarkdown(html) {
    var text = html;
    // 处理换行
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    // 标题
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, function(_, c) { return '# ' + c.trim() + '\n'; });
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, function(_, c) { return '## ' + c.trim() + '\n'; });
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, function(_, c) { return '### ' + c.trim() + '\n'; });
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, function(_, c) { return '#### ' + c.trim() + '\n'; });
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, function(_, c) { return '##### ' + c.trim() + '\n'; });
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, function(_, c) { return '###### ' + c.trim() + '\n'; });
    // 粗体/斜体
    text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, function(_, t, c) { return '**' + c + '**'; });
    text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, function(_, t, c) { return '*' + c + '*'; });
    // 图片
    text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, function(_, src) {
        if (src && !src.match(/^https?:\/\//)) {
            src = config.site_url + '/attachment/' + src;
        }
        return '![图片](' + src + ')';
    });
    // 链接
    text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, function(_, href, t) {
        return '[' + t.trim() + '](' + href + ')';
    });
    // 列表
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, function(_, c) { return '- ' + c.trim() + '\n'; });
    // 去除剩余标签
    text = text.replace(/<[^>]+>/g, '');
    // 解码 HTML 实体
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    // 清理多余空行
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}

function formatTime(ts) {
    var d = new Date(parseInt(ts) * 1000);
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    var h = ('0' + d.getHours()).slice(-2);
    var min = ('0' + d.getMinutes()).slice(-2);
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
}

// ============================================================
// API请求
// ============================================================

function apiRequest(op, data, callback) {
    var apiUrl = config.site_url + '/web/index.php?c=site&a=entry&m=hk_wzz&do=cli_api&direct=1&op=' + op;
    var parsed = new URL(apiUrl);

    var headers = {};

    // 从凭据文件读取token和uniacid
    var cred = loadCredentials();
    if (cred && cred.token) {
        headers['X-CLI-TOKEN'] = cred.token;
        headers['X-CLI-UNIACID'] = String(cred.uniacid);
    }

    var postData = null;
    if (data) {
        postData = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
    }

    var options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: data ? 'POST' : 'GET',
        headers: headers,
        rejectUnauthorized: false
    };

    var httpModule = parsed.protocol === 'https:' ? https : http;

    var req = httpModule.request(options, function(res) {
        var body = '';
        res.setEncoding('utf8');
        res.on('data', function(chunk) { body += chunk; });
        res.on('end', function() {
            try {
                var result = JSON.parse(body);
                if (result.errno === 401) {
                    console.log('Token无效或已过期，请更新 config.json 中的 token');
                    process.exit(1);
                }
                callback(null, result);
            } catch (e) {
                callback('响应解析失败: ' + body.substring(0, 200));
            }
        });
    });

    req.on('error', function(e) {
        callback('网络错误: ' + e.message);
    });

    req.setTimeout(60000, function() {
        req.abort();
        callback('请求超时');
    });

    if (postData) {
        req.write(postData);
    }
    req.end();
}

// ============================================================
// 图片上传
// ============================================================

function uploadImage(filePath, callback) {
    var imageData = fs.readFileSync(filePath);
    var base64 = imageData.toString('base64');
    var ext = path.extname(filePath).slice(1).toLowerCase();
    var mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    var base64Str = 'data:' + mime + ';base64,' + base64;

    apiRequest('cli_upload', { image: base64Str }, function(err, result) {
        if (err) {
            callback(err);
            return;
        }
        if (result && result.errno === 0) {
            callback(null, result.data.url);
        } else {
            callback(result ? result.message : '未知错误');
        }
    });
}

// ============================================================
// Markdown解析
// ============================================================

function parseFrontmatter(content) {
    var meta = {};
    var body = content;
    var hasFrontmatter = false;

    var match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (match) {
        hasFrontmatter = true;
        var yamlStr = match[1];
        body = match[2];

        yamlStr.split('\n').forEach(function(line) {
            line = line.trim();
            if (!line || line.charAt(0) === '#') return;
            var pos = line.indexOf(':');
            if (pos > -1) {
                var key = line.substring(0, pos).trim();
                var value = line.substring(pos + 1).trim();
                // 去掉引号
                value = value.replace(/^['"]|['"]$/g, '');
                meta[key] = value;
            }
        });
    }

    return { meta: meta, body: body, hasFrontmatter: hasFrontmatter };
}

function parseBody(body) {
    var segments = [];
    body = body.trim();

    // 移除末尾的AI声明（如 "> (注：内容由 AI 生成...）"）
    body = body.replace(/\n*>\s*[\(（].*(?:AI|人工智能).*[\)）]\s*$/, '').trim();

    var lines = body.split('\n');
    var textBuffer = [];

    function flushText() {
        if (textBuffer.length === 0) return;
        var text = textBuffer.join('\n').trim();
        if (text) {
            var html = markdownToHtml(text);
            segments.push({ type: 'text', content: html });
        }
        textBuffer = [];
    }

    lines.forEach(function(line) {
        // 检查是否是图片行
        var imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
            flushText();
            segments.push({ type: 'image', path: imgMatch[2], alt: imgMatch[1] });
            return;
        }
        // 检查是否是视频行 [视频](url)
        var videoMatch = line.trim().match(/^\[视频\]\(([^)]+)\)$/);
        if (videoMatch) {
            flushText();
            segments.push({ type: 'video', url: videoMatch[1] });
            return;
        }
        textBuffer.push(line);
    });

    flushText();
    return segments;
}

function markdownToHtml(text) {
    // 按行处理，支持块级元素
    var lines = text.split('\n');
    var result = [];

    lines.forEach(function(line) {
        // 标题 # ~ ######
        var headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            var level = headingMatch[1].length;
            var content = headingMatch[2];
            content = inlineFormat(content);
            result.push('<h' + level + '>' + content + '</h' + level + '>');
            return;
        }

        // 引用 > text
        var quoteMatch = line.match(/^>\s*(.*)$/);
        if (quoteMatch) {
            var qContent = inlineFormat(quoteMatch[1]);
            result.push('<blockquote>' + qContent + '</blockquote>');
            return;
        }

        // 普通行
        result.push(inlineFormat(line));
    });

    return result.join('<br/>');
}

function inlineFormat(text) {
    // 加粗 **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体 *text*
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 行内代码
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    return text;
}

// ============================================================
// 组件构建
// ============================================================

function buildRichtextItem(html) {
    return {
        itemid: generateItemid(),
        id: 'richtext',
        params: {
            content: Buffer.from(html).toString('base64')
        },
        style: {
            background: '#ffffff',
            padding: '10'
        }
    };
}

function buildPictureItem(imgUrl) {
    return {
        itemid: generateItemid(),
        id: 'picture',
        data: [{
            imgurl: imgUrl,
            linkurl: ''
        }],
        style: {
            paddingtop: '0',
            paddingleft: '0',
            background: '#ffffff'
        }
    };
}

function buildVideoItem(videoUrl) {
    return {
        itemid: generateItemid(),
        id: 'video',
        params: {
            videourl: videoUrl
        },
        style: {
            background: '#ffffff',
            padding: '10'
        }
    };
}

function generateItemid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

// ============================================================
// 辅助函数
// ============================================================

function resolvePath(p, baseDir) {
    if (path.isAbsolute(p)) return p;
    return path.join(baseDir, p);
}

function stripTags(str) {
    return str.replace(/<[^>]+>/g, '');
}

function padStr(str, len) {
    str = String(str);
    while (str.length < len) str += ' ';
    return str;
}

function repeat(char, count) {
    var result = '';
    for (var i = 0; i < count; i++) result += char;
    return result;
}
