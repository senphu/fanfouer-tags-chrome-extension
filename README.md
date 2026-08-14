# 饭人画像谷歌插件

这是一个基于 Chrome Manifest V3 的本地插件，用于给饭人添加、查看和管理自定义标签。

作者：肥魔（serylab+fanfouer+tags@gmail.com）, driving Codex, since 2026-08

插件只在以下页面生效：

```text
https://m.fanfou.com/*
```

## 一、功能说明

- 鼠标移动到用户链接上时，在链接附近显示该用户的标签。
- 支持在悬浮卡片中直接添加标签和删除标签。
- 【彩蛋】鼠标在照片链接（`a.photo`，支持 `/photo/...` 和 `/photo.normal/...`）上持续悬停 1 秒时，自动提取其中的 `img[src]`，去除缩略图尺寸后缀并全屏预览原图。
- 【彩蛋】原图预览只会在图片过大时缩小，较小图片保持原始尺寸；点击预览层任意位置或按 `Esc` 即可关闭。
- 当当前地址以 `/p.数字` 结尾时，可按左箭头切换到上一页、按右箭头切换到下一页；`p.1` 不会继续向左生成 `p.0`。
- 标签保存在 Chrome 的扩展本地存储中，刷新页面不会丢失。
- 特别提示：所有的数据仅存于你的本地，不上云，如果要迁移配置，请点击插件图标，在配置页上完成全部标签的导入和导出。
- 导入使用合并策略：相同用户的标签会合并并自动去重，不会覆盖原有标签。

## 二、安装前准备

这是一个“未打包扩展”，当前需要通过 Chrome 的开发者模式安装。

项目仓库：

```text
git@github.com:senphu/fanfouer-tags-chrome-extension.git
```

GitHub 页面：[senphu/fanfouer-tags-chrome-extension](https://github.com/senphu/fanfouer-tags-chrome-extension)

请先确认解压后的目录中存在以下文件：

```text
fanfouer-tags-chrome-extension/
├── manifest.json
├── background.js
├── content.js
├── options.html
├── options.js
└── options.css
```

安装时需要选择包含 `manifest.json` 的解压后的文件夹，而不是单独选择某个文件。

## 三、安装步骤

请选择下面任意一种方式获取插件代码。

### 方式一：使用 Git 获取和更新

#### 1. 克隆仓库

在终端执行：

```bash
git clone git@github.com:senphu/fanfouer-tags-chrome-extension.git
cd fanfouer-tags-chrome-extension
```

如果提示 `Permission denied (publickey)`，说明当前电脑还没有配置 GitHub SSH Key，需要先完成 GitHub SSH 认证。

克隆完成后，插件代码会保存在本地的 `fanfouer-tags-chrome-extension` 目录中。

### 方式二：下载 GitHub ZIP 压缩包

点击下面的链接下载最新代码：

[下载 fanfouer-tags-chrome-extension-main.zip](https://github.com/senphu/fanfouer-tags-chrome-extension/archive/refs/heads/main.zip)

下载完成后解压压缩包。解压后的目录通常类似：

```text
fanfouer-tags-chrome-extension-main/
```

请在 Chrome 中选择包含 `manifest.json` 的解压目录。

### 3. 在 Chrome 中加载插件

#### 打开扩展管理页面

在 Chrome 地址栏输入并打开：

```text
chrome://extensions/
```

也可以通过菜单进入：

```text
Chrome 菜单 → 扩展程序 → 管理扩展程序
```

#### 开启开发者模式

打开扩展管理页面右上角的“开发者模式”。

打开后页面上方会出现“加载已解压的扩展程序”按钮。

#### 加载插件目录

点击“加载已解压的扩展程序”，在文件选择窗口中选择 Git 克隆目录或 ZIP 解压目录。

选择成功后，扩展列表中应该出现“饭人画像谷歌插件”。

#### 固定插件图标

如果 Chrome 工具栏中没有显示插件图标：

1. 点击工具栏右侧的拼图图标。
2. 找到“饭人画像谷歌插件”。
3. 点击旁边的图钉，将插件固定到工具栏。

## 四、使用标签功能

### 查看和编辑用户标签

1. 在Chrome中打开m饭移动版页面，例如：

   ```text
   https://m.fanfou.com/
   ```

2. 找到页面中的用户链接。
3. 将鼠标移动到用户链接上。
4. 插件会自动加载对应用户 ID 的标签，并显示悬浮卡片。
5. 在悬浮卡片中可以：
   - 输入内容后点击“添加”，增加标签；
   - 点击标签右侧的“×”，删除标签。


标签示例：

```text
性别男
爱好鲜花
摄影
朋友
需要关注
```

每个标签最多 200 个字符。


## 五、导入和导出数据

### 导出标签

1. 点击 Chrome 工具栏中的“饭人画像谷歌插件”图标。
2. 插件会打开配置页。
3. 点击“导出全部标签”。
4. Chrome 会下载一个 JSON 文件，例如：

   ```text
   fanfou-user-tags-2026-08-14.json
   ```

建议定期导出备份，尤其是在更换电脑、Chrome 用户配置或准备卸载插件之前。

### 导入标签

1. 点击 Chrome 工具栏中的“饭人画像谷歌插件”图标，打开配置页。
2. 点击“导入标签文件”。
3. 选择之前导出的 `.json` 文件。
4. 导入完成后，页面会刷新当前用户数量和标签数量。

导入不会覆盖已有内容，而是执行以下操作：

- 相同用户的标签合并；
- 重复标签自动去重；
- 空标签自动忽略；
- 无效或不符合格式的数据不会写入。

导出文件示例：

```json
{
  "schema": "fanfou-user-tags",
  "version": 1,
  "exportedAt": "2026-08-14T00:00:00.000Z",
  "author": {
    "name": "肥魔",
    "email": "serylab+fanfouer+tags@gmail.com"
  },
  "users": {
    "Sery": ["性别男", "爱好女"],
    "wangxing": ["尊敬的造物主"]
  }
}
```

## 六、更新插件代码

### 使用 Git 更新

如果插件是通过 `git clone` 安装的：

```bash
cd /你的本地路径/fanfouer-tags-chrome-extension
git pull --ff-only origin main
```

1. 打开 `chrome://extensions/`。
2. 找到“饭人画像谷歌插件”。
3. 点击扩展卡片上的刷新按钮。
4. 回到已经打开的页面，重新刷新页面。

### 使用 ZIP 更新

如果插件是通过 ZIP 安装的：

1. 先在配置页导出标签 JSON，作为备份。
2. 下载最新的 [GitHub ZIP 压缩包](https://github.com/senphu/fanfouer-tags-chrome-extension/archive/refs/heads/main.zip)。
3. 解压最新压缩包。
4. 将新目录中的文件复制到原来加载的插件目录，并覆盖旧文件。
5. 不要直接删除原来的插件目录或更换加载目录，以免本地标签数据与原扩展环境失去关联。
6. 打开 `chrome://extensions/`，点击“饭人画像谷歌插件”的刷新按钮。
7. 刷新已经打开的页面。

如果已经换成了新的插件目录，建议先导入之前导出的 JSON 标签备份，再继续使用。

## 七、常见问题

### 页面上没有出现悬浮标签

请依次检查：

1. 当前地址是否以 `https://m.fanfou.com/` 开头。
2. 是否已经在扩展管理页面刷新插件。
3. 页面是否已经刷新。
4. 用户链接是否符合 `a.former`、`a.p` 或普通根路径链接规则。


### 点击插件图标没有打开配置页

请打开 `chrome://extensions/`，确认“饭人画像谷歌插件”没有显示错误信息。若显示错误，请点击“错误”查看详细信息，然后刷新插件。

### 如何查看详细错误信息

在页面按 `F12` 或右键选择“检查”，打开“Console/控制台”。

插件日志会使用以下前缀，便于筛选：

```text
[饭人画像谷歌插件][页面]
[饭人画像谷歌插件][配置页]
[饭人画像谷歌插件][后台]
```

### 卸载插件会不会丢失标签

标签保存在 Chrome 的扩展本地存储中。卸载扩展或清除扩展数据可能导致标签丢失，因此建议先在配置页导出 JSON 备份。

## 八、项目文件说明

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | Chrome 插件配置和权限声明 |
| `content.js` | 页面中的用户链接识别和悬浮标签卡片 |
| `background.js` | 本地标签数据的读取、保存、导入和导出 |
| `options.html` | 插件配置页界面 |
| `options.js` | 配置页导入、导出和统计逻辑 |
| `options.css` | 配置页样式 |

## 九，维护信息

因为饭人是小众领地，请找到我们的微信群反馈信息，不接受任何嘲讽。

## 十，偏好
本人极其讨厌https://www.csdn.net 和 https://gitcode.com ，不同意这两者利用本资源，如果发现这两家侵权，麻烦互相转告。
