// 聚合根 参与者档案：一位老人一份，用 My Aged Care 编号认她
export type FileState = '待评估' | '未签约' | '已签约' | '已到位' | '在册' | '已退出'

export class ParticipantFile {
  // 身份
  readonly myAgedCareId: string
  readonly name: string
  // 业务属性 · 批了什么
  allowedServiceTypes: string[]
  // 业务属性 · 走到哪天
  agreementSignedOn?: Date
  fundsAllocatedOn?: Date
  entryOn?: Date
  // 状态
  state: FileState
  // 成员
  level: LevelAndPathway
  copay?: CopayRate

  // 守：编号必填、分级必填；抛：通知书不全；发：档案已建
  static register(notice: Notice, plan: SupportPlan): [ParticipantFile, FileCreated] {
    if (!notice.myAgedCareId || !notice.level) throw new IncompleteNotice()
    const file = new ParticipantFile(notice, plan.allowedServiceTypes)
    file.state = '未签约'
    return [file, new FileCreated(file.myAgedCareId)]
  }

  // 守：状态是未签约；抛：还没建档或已签过；发：协议已签
  recordAgreement(on: Date): AgreementSigned {
    if (this.state !== '未签约') throw new NotAwaitingAgreement(this.state)
    this.agreementSignedOn = on
    this.state = '已签约'
    return new AgreementSigned(this.myAgedCareId, on)
  }

  // 守：状态是已签约；发：资金已分到
  recordAllocation(on: Date, kind: '全额' | '过渡'): FundsAllocated {
    if (this.state !== '已签约') throw new NotAwaitingAllocation(this.state)
    this.fundsAllocatedOn = on
    this.state = '已到位'
    return new FundsAllocated(this.myAgedCareId, on, kind, this.level)
  }

  // 守：在分到资金起 56 天内（延期 84 天）；抛：过了期限；发：服务已开始
  startService(on: Date): ServiceStarted { /* 做法：算天数、改入场日与状态 */ }
}
