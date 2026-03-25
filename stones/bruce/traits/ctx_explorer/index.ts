
export function deepInspectCtx(ctx) {
  const info = {};
  
  // 1. data 的内容
  info.dataType = typeof ctx.data;
  if (ctx.data && typeof ctx.data === 'object') {
    info.dataKeys = Object.keys(ctx.data);
    info.dataSnapshot = JSON.stringify(ctx.data).slice(0, 500);
  }
  
  // 2. taskId
  info.taskId = ctx.taskId;
  
  // 3. sharedDir
  info.sharedDir = ctx.sharedDir;
  
  // 4. setData 测试
  try {
    ctx.setData("_ctx_test_key", "ctx_test_value");
    info.setDataWorks = true;
  } catch(e) {
    info.setDataWorks = false;
    info.setDataError = e.message;
  }
  
  // 5. print 测试
  info.hasPrint = typeof ctx.print === 'function';
  
  // 6. 检查是否有隐藏属性
  info.allProps = Object.getOwnPropertyNames(ctx);
  
  return info;
}

export function ctxSetAndRead(ctx, key, value) {
  ctx.setData(key, value);
  // 设置后能否从 data 中读到？
  const readBack = ctx.data ? ctx.data[key] : undefined;
  return { set: true, readBack };
}
