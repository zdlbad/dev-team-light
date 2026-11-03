// 领域服务 参与者登记：同一个 My Aged Care 编号只有一份档案
// 纯函数：命令先查仓储，把查到的递进来，它只比对
export const ParticipantRegistration = {
  ensureUnique(id: string, existing: ParticipantFile | undefined) {
    if (existing) throw new DuplicateParticipant(id)
  } }
