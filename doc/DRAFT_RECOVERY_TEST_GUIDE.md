# ListingLive 草稿恢复功能测试指南

**测试环境**: http://localhost:3001  
**测试账号**: `verify0312201931` / `Test123!`  
**测试日期**: 2026-03-12

---

## 目标一：验证"去素材页返回后草稿恢复"（短视频）

### 测试步骤

1. **登录**
   - 打开 http://localhost:3001
   - 使用账号 `verify0312201931` / `Test123!` 登录

2. **创建短视频草稿**
   - 进入 `/videos/create`
   - 上传本地图片：`C:\Users\steff\.cursor\projects\c-Data-projects-listinglive\assets\c__Users_steff_AppData_Roaming_Cursor_User_workspaceStorage_6b58727965dc326e5810f698746e0b6c_images_image-515e9e46-4eb0-48af-ad9e-d8af790981d8.png`
   - 完成至少到 step 2，确保有草稿内容（例如：选择了模板、填写了标题等）

3. **跳转到素材中心**
   - 点击页面中的"素材中心"或相关入口
   - 进入 `/account/logos` 页面

4. **返回创建页**
   - 点击浏览器后退按钮或导航返回 `/videos/create`

5. **验证草稿恢复**
   - ✅ 是否出现"草稿恢复提示条"或"继续编辑"按钮
   - ✅ 点击恢复后，之前上传的图片是否仍在
   - ✅ 之前选择的模板、填写的内容是否保留
   - ✅ 可以继续编辑并进入下一步

### 预期结果
- 出现明显的草稿恢复 UI（通知条/对话框/按钮）
- 草稿内容完整恢复（图片、表单内容、步骤进度）

### 记录区
- [ ] 通过 / [ ] 失败
- 观察到的现象：
- 失败点（如有）：

---

## 目标二：验证"token 失效后跳登录并恢复草稿"

### 测试步骤

1. **准备草稿**
   - 在 `/videos/create` 页面创建一个未完成的草稿
   - 确保有上传的图片和部分填写的内容

2. **模拟 token 失效**
   - 打开浏览器开发者工具（F12）
   - 切换到 Console 标签
   - 执行以下代码使 token 失效：
     ```javascript
     localStorage.setItem('access_token', 'invalid_token_xxx');
     localStorage.setItem('refresh_token', 'invalid_refresh_xxx');
     console.log('Token已设为无效值');
     ```

3. **触发 session 预检**
   - 在创建页点击"生成"或其他需要与后端交互的按钮
   - 观察页面反应

4. **验证跳转行为**
   - ✅ 是否被重定向到 `/login?next=...` 而不是停留在原页面报 401 错误
   - ✅ 登录页的 URL 中是否包含 `next` 参数指向原页面

5. **重新登录**
   - 使用 `verify0312201931` / `Test123!` 重新登录

6. **验证草稿恢复**
   - ✅ 登录成功后是否自动返回 `/videos/create`
   - ✅ 是否出现"未完成草稿"/"继续编辑"/"继续提交"等恢复 UI
   - ✅ 点击"继续编辑"后，草稿内容是否完整恢复

### 预期结果
- token 失效时优雅跳转到登录页，不在原页面报错
- 登录后自动返回原页面并提供草稿恢复选项
- 草稿内容完整保留

### 记录区
- [ ] 通过 / [ ] 失败
- 观察到的现象：
- 失败点（如有）：

---

## 目标三：验证长视频页的草稿恢复能力

### 测试步骤

1. **创建长视频草稿**
   - 进入 `/videos/merge`
   - 上传至少两张图片（可以是同一张图片的多次上传）
   - 使用图片路径：`C:\Users\steff\.cursor\projects\c-Data-projects-listinglive\assets\c__Users_steff_AppData_Roaming_Cursor_User_workspaceStorage_6b58727965dc326e5810f698746e0b6c_images_image-515e9e46-4eb0-48af-ad9e-d8af790981d8.png`
   - 确保图片列表已显示

2. **跳转到素材中心**
   - 点击"素材中心"或相关链接
   - 进入 `/account/logos` 页面

3. **返回长视频页**
   - 点击浏览器后退按钮或导航返回 `/videos/merge`

4. **验证草稿恢复**
   - ✅ 是否出现"长视频草稿恢复提示"
   - ✅ 恢复后，图片列表是否完整（数量和顺序正确）
   - ✅ 可以继续编辑（添加/删除/排序图片）

### 预期结果
- 长视频页有与短视频页类似的草稿恢复机制
- 多图片列表能够完整恢复

### 记录区
- [ ] 通过 / [ ] 失败
- 观察到的现象：
- 失败点（如有）：

---

## 测试注意事项

1. **不要求提交任务**：本次测试重点是验证草稿恢复体验，不需要真正创建视频任务
2. **记录详细信息**：如果某步失败，请记录：
   - 具体卡住的位置
   - 页面表现（是否有错误提示、UI 状态）
   - 浏览器控制台错误信息（F12 Console）
   - 网络请求失败情况（F12 Network）
3. **检查 localStorage**：可以在控制台查看草稿存储情况：
   ```javascript
   console.log('短视频草稿:', localStorage.getItem('pendingVideoTask'));
   console.log('长视频草稿:', localStorage.getItem('pendingMergeVideoTask'));
   ```

---

## 测试总结模板

### 目标一结果
- [ ] 通过 / [ ] 失败
- 关键观察：
- 失败原因（如有）：

### 目标二结果
- [ ] 通过 / [ ] 失败
- 关键观察：
- 失败原因（如有）：

### 目标三结果
- [ ] 通过 / [ ] 失败
- 关键观察：
- 失败原因（如有）：

### 整体评估
- 草稿恢复机制是否满足需求：
- 用户体验是否流畅：
- 需要改进的地方：
