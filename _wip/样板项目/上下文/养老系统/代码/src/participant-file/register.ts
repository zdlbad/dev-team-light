// 命令 建档：查编号没重复 → 参与者档案.建档 → 存 → 发 档案已建
// 自己抛：通知书上没有编号
export async function register(cmd: { notice: Notice; plan: SupportPlan }, deps: Deps) {
  if (!cmd.notice.myAgedCareId) throw new NoticeWithoutId()
  const existing = await deps.files.findByMyAgedCareId(cmd.notice.myAgedCareId)
  ParticipantRegistration.ensureUnique(cmd.notice.myAgedCareId, existing)   // 领域服务，抛 这个编号已有档案
  const [file, event] = ParticipantFile.register(cmd.notice, cmd.plan)
  await deps.files.save(file)
  await deps.events.publish(event)
  return file.myAgedCareId
}
