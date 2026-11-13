import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleParse } from '../src/services/parser.js';

const today = '2026-11-13';

test('카드 승인 문자 여러 건', () => {
  const sms = `[신한카드] 승인 홍*동 6,500원 11/13 14:22 스타벅스
[KB국민체크] 홍*동님 4,000원 승인 11/12 12:05 김밥천국 누적 120,000원
[신한카드] 승인취소 홍*동 6,500원 11/13 14:30 스타벅스`;
  const { items, ignored } = ruleParse(sms, today);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => [i.type, i.amount, i.date, i.category, i.memo]),
    [
      ['expense', 6500, '2026-11-13', '카페/간식', '스타벅스'],
      ['expense', 4000, '2026-11-12', '식비', '김밥천국'],
    ],
  );
  assert.equal(ignored.length, 1);
});

test('은행 입금 문자와 잔액 무시', () => {
  const { items } = ruleParse('[카카오뱅크] 입금 300,000원 11/10 09:00 알바비 잔액 1,250,000원', today);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'income');
  assert.equal(items[0].amount, 300000);
});

test('자연어 문장과 연도 보정', () => {
  const { items } = ruleParse('점심 김밥 4천원\n택시 1만 2천원', today);
  assert.deepEqual(items.map((i) => [i.amount, i.category]), [[4000, '식비'], [12000, '교통']]);
  assert.equal(ruleParse('[신한카드] 승인 5,000원 12/30 10:00 CU', today).items[0].date, '2025-12-30');
});

test('문자와 일반 문장이 섞여 있어도 각각 분리', () => {
  const { items } = ruleParse('[카카오뱅크] 입금 50,000원 11/13 09:00 용돈\n퇴근길 택시 1만 2천원', today);
  assert.deepEqual(items.map((i) => [i.type, i.amount, i.memo]), [
    ['income', 50000, '용돈'],
    ['expense', 12000, '퇴근길 택시'],
  ]);
});

test('여러 줄로 온 문자 한 통 + 누적 줄 무시', () => {
  const sms = `[Web발신]
신한카드(1234)승인
홍*동
6,500원(일시불)
11/13 14:22
스타벅스
누적123,000원
[Web발신]
신한카드(1234)승인
홍*동
4,000원(일시불)
11/13 12:05
김밥천국`;
  const { items } = ruleParse(sms, today);
  assert.deepEqual(items.map((i) => [i.amount, i.date, i.memo, i.category]), [
    [6500, '2026-11-13', '스타벅스', '카페/간식'],
    [4000, '2026-11-13', '김밥천국', '식비'],
  ]);
});
