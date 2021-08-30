const { pendantsConfig } =require('./config');
const UToolsUtils = require('./utils/UToolsUtils');
const runList = [];
function createWindow (itemData, {position = {}, data = {}} ={})  {
    return new Promise((resolve, reject) => {
        try {
            itemData = {...itemData};
            delete itemData.win;
            const win = utools.createBrowserWindow(itemData.src, {...itemData.options, ...position}, () => {
                // 发送 id/初始数据
                win.setSkipTaskbar(true);
                if (itemData.options && itemData.options.webPreferences && itemData.options.webPreferences.devTools) {
                    win.webContents.openDevTools({ mode: 'detach' });
                }
                ipcRenderer.sendTo(win.webContents.id, 'init', JSON.stringify(data));
                if (itemData.currentTheme) {
                    // 有主题发送主题信息
                    const { width, height } = itemData.currentTheme;
                    if (width && height) {
                        win.setSize(width, height);
                    }
                    ipcRenderer.sendTo(win.webContents.id, 'setTheme', JSON.stringify(itemData.currentTheme));
                }
                runList.push({...itemData, win, saveId: Date.now() + Math.floor(Math.random() * 10000)});
                resolve(true);
            });
        }catch (e) {
            console.log(e);
            reject(false);
        }
    })
}
function saveWindowPosition(itemData, pendantData = {}) {
    debugger;
    const position = itemData.win.getPosition();
    const data = {position: {x: position[0], y: position[1]}, data: pendantData};
    let nativeId = '';
    if (itemData.dataIsolation) {
        // 数据隔离
        nativeId = '/' + utools.getNativeId();
    }
    if (itemData.single) {
        // 单例挂件
        UToolsUtils.save(`${itemData.id}${nativeId}/data`, {...data});
        return;
    }
    UToolsUtils.save(`${itemData.id}${nativeId}/data/${itemData.saveId}`, {...data});
}
window.exports = {
    // 挂件列表
    gj: {
        mode: "list",
        args: {
            // 进入插件时调用
            enter: async (action, callbackSetList) => {
                callbackSetList(pendantsConfig);
            },
            select: async (action, itemData, callbackSetList) => {
                const index = runList.findIndex(item => item.id === itemData.id);
                if (itemData.theme && itemData.theme.length === 1) {
                    // 只有一个主题
                    itemData = {...itemData, flag: 1, currentTheme: itemData.theme[0] }
                }
                if (itemData.theme && !itemData.flag) {
                    debugger;
                    const theme = itemData.theme.map(item => {
                        const {title, description = '', author = '' } = item;
                        return {...itemData, title,
                            description: [author, description].filter(i => i.length).join('|'),
                            flag: 1, currentTheme: item };
                    });
                    callbackSetList([...theme])
                    return;
                }
                if (index !== -1 && itemData.single) {
                    try {
                        const win = runList[index].win;
                        saveWindowPosition(runList[index]);
                        win.close();
                        runList.splice(index, 1);
                        return;
                    }catch (e) {
                        console.log(e)
                    }
                }
                let nativeId = '';
                if (itemData.dataIsolation) {
                    // 数据隔离
                    nativeId = '/' + utools.getNativeId();
                }
                if (itemData.single) {
                    const data = UToolsUtils.read(`${itemData.id}${nativeId}/data`) || {};
                    await createWindow(itemData, data);
                } else  {
                    const docs = utools.db.allDocs(`${itemData.id}${nativeId}/data/`);
                    const index = runList.findIndex(item => item.id === itemData.id);
                    if (!docs.length || index !== -1) {
                        await createWindow(itemData);
                        return;
                    }
                    for (const doc of docs) {
                        if (typeof(doc.data)=='string') {
                            doc.data = JSON.parse(doc.data);
                        }
                        await createWindow(itemData, doc.data);
                        console.log(doc);
                        utools.db.remove(doc._id);
                    }
                }
            }
        }
    },
    gjSetting: {
        mode: "list",
        args: {
            // 进入插件时调用
            enter: async (action, callbackSetList) => {
                const items = pendantsConfig.filter(item => item.setting);
                const list = items.map(item => {
                    const { title, setting } = item;
                    return {
                        title,
                        setting
                    }
                })
                callbackSetList(list);
            },
            select: async (action, itemData, callbackSetList) => {
                const { setting } = itemData;
                const index = runList.findIndex(item => item.setting && item.src === setting.src);
                if (index !== -1) {
                    utools.showNotification('当前挂件设置已经打开');
                    return;
                }
                const win = utools.createBrowserWindow(setting.src, setting.options, () => {
                    debugger;
                    ipcRenderer.sendTo(win.webContents.id, 'init');
                    win.webContents.openDevTools({ mode: 'detach' });
                    runList.push({setting: true, win, src: setting.src})
                })
            }
        }
    }
}
// 通信
const { ipcRenderer } = require('electron');

// 窗口控制
/**
 * 通过「发送者ID」在运行窗口列表中找到对应的配置项
 * @param id 发送者ID
 * @return {*}
 */
function getRunItemById(id) {
    const index = runList.findIndex(item => item.win.webContents.id === id);
    return { res: runList[index], index };
}
/**
 * 窗口关闭
 */
ipcRenderer.on('control::close', (event) => {
    const { res, index } = getRunItemById(event.senderId);
    console.log('close');
    try {
        setTimeout(() => {
            if (res.win) {
                res.win.destroy();
            }
            if (index !== -1) {
                runList.splice(index, 1);
            }
        });
    }catch (e) {}
});
/**
 * 新建当前类型的窗体
 */
ipcRenderer.on('control::clone', (event) => {
    const { res, index } = getRunItemById(event.senderId);
    saveWindowPosition(res);
    createWindow({...res});
});
/**
 * 设置是否置顶
 */
ipcRenderer.on('control::setAlwaysOnTop', (event, data) => {
    const { res, index } = getRunItemById(event.senderId);
    data = data || "{}";
    const { status = !res.win.isAlwaysOnTop()} = JSON.parse(data);
    res.win.setAlwaysOnTop(status);
    console.log('control::setAlwaysOnTop');
    // utools.showNotification(`窗口${status ? '置顶' : '取消置顶'}成功`)
});
/**
 * 设置是否全屏
 */
ipcRenderer.on('control::setFullScreen', (event, data) => {
    const { res, index } = getRunItemById(event.senderId);
    data = data || "{}";
    const { status = !res.win.isFullScreen()} = JSON.parse(data);
    res.win.setFullScreen(status)
})
/**
 * 重新设置窗口大小
 */
ipcRenderer.on('control::resize', (event, data) => {
    const {res, index} = getRunItemById(event.senderId);
    data = JSON.parse(data);
    const size = res.win.getSize();
    const {width = size[0], height = size[1]} = data;
    res.win.setSize(width, height);
})
ipcRenderer.on('control::setPosition', (event, data) => {
    const {res, index} = getRunItemById(event.senderId);
    data = JSON.parse(data);
    const pos = res.win.getPosition();
    const {x = pos[0], y = pos[1]} = data || {};
    res.win.setPosition(x, y);
});
// 数据类
/**
 * 保存数据
 */
ipcRenderer.on('data::saveData', (event, data) => {
    if (!data) {
        data = {};
        console.log('没有数据')
    }
    const { res, index } = getRunItemById(event.senderId);
    data = JSON.parse(data);
    if (res.single) {
        saveWindowPosition(res, data);
        return;
    }
    saveWindowPosition(res, data);
});
/**
 * 移除数据
 */
ipcRenderer.on('data::removeData', (event) => {
    const { res, index } = getRunItemById(event.senderId);
    let nativeId = '';
    if (res.dataIsolation) {
        // 数据隔离
        nativeId = '/' + utools.getNativeId();
    }
    if (res.single) {
        utools.db.remove(`${res.id}${nativeId}/data`);
    } else {
        utools.db.remove(`${res.id}${nativeId}/data/${res.saveId}`);
    }
});
// 信息类

