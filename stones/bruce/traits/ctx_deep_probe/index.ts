
export function deepProbe(ctx) {
  const info = {
    // ctx.data 的类型和内容
    dataType: typeof ctx.data,
    dataKeys: ctx.data ? Object.keys(ctx.data) : [],
    dataContent: ctx.data,
    
    // ctx.setData 的类型
    setDataType: typeof ctx.setData,
    
    // 检查是否有 getData / persistData
    hasGetData: typeof ctx.getData,
    hasPersistData: typeof ctx.persistData,
    hasGet: typeof ctx.get,
    hasSet: typeof ctx.set,
    
    // ctx.print 的类型
    printType: typeof ctx.print,
    
    // taskId 和 sharedDir 的值
    taskId: ctx.taskId,
    sharedDir: ctx.sharedDir,
  };
  return info;
}
