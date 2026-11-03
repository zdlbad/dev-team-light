describe('参与者档案.建档', () => {
  it('守：编号必填 → 抛 通知书不全', () => { expect(() => ParticipantFile.register({ ...notice, myAgedCareId: '' }, plan)).toThrow(IncompleteNotice) })
  it('守：分级必填 → 抛 通知书不全', () => { expect(() => ParticipantFile.register({ ...notice, level: undefined }, plan)).toThrow(IncompleteNotice) })
  it('发：档案已建，状态到 未签约', () => { const [file, ev] = ParticipantFile.register(notice, plan); expect(file.state).toBe('未签约'); expect(ev).toBeInstanceOf(FileCreated) })
})
describe('参与者档案.记签协议', () => {
  it('守：状态是未签约 → 抛 还没建档或已签过', () => { … })
  it('发：协议已签，状态到 已签约', () => { … })
})
describe('参与者档案.记分到资金', () => {
  it('守：状态是已签约 → 抛', () => { … })   // ✗ 跑挂了：现在没查状态
})
