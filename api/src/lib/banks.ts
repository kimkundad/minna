/**
 * Where a teacher banks.
 *
 * Two lists and one validator, kept small on purpose.
 *
 * There is no worldwide register of banks anybody can ship in a file, and a
 * half-finished one is worse than none: a teacher whose bank is missing from
 * the dropdown cannot be paid. So the country is a closed list, the bank is
 * free text everywhere except Thailand, and the one piece that identifies a
 * bank internationally — the SWIFT/BIC code — is checked for shape.
 */

/**
 * The countries the school expects to pay into.
 *
 * Drawn from the currencies it deals in, plus the places its teachers live.
 * Not the whole ISO list: 250 entries to scroll past makes the common case
 * slower, and a country that is missing is a line in an email, not a bug.
 */
export const PAYOUT_COUNTRIES: { code: string; name: { en: string; th: string } }[] = [
  { code: 'TH', name: { en: 'Thailand', th: 'ไทย' } },
  { code: 'JP', name: { en: 'Japan', th: 'ญี่ปุ่น' } },
  { code: 'VN', name: { en: 'Vietnam', th: 'เวียดนาม' } },
  { code: 'CN', name: { en: 'China', th: 'จีน' } },
  { code: 'TW', name: { en: 'Taiwan', th: 'ไต้หวัน' } },
  { code: 'HK', name: { en: 'Hong Kong', th: 'ฮ่องกง' } },
  { code: 'KR', name: { en: 'South Korea', th: 'เกาหลีใต้' } },
  { code: 'SG', name: { en: 'Singapore', th: 'สิงคโปร์' } },
  { code: 'MY', name: { en: 'Malaysia', th: 'มาเลเซีย' } },
  { code: 'ID', name: { en: 'Indonesia', th: 'อินโดนีเซีย' } },
  { code: 'PH', name: { en: 'Philippines', th: 'ฟิลิปปินส์' } },
  { code: 'IN', name: { en: 'India', th: 'อินเดีย' } },
  { code: 'GB', name: { en: 'United Kingdom', th: 'สหราชอาณาจักร' } },
  { code: 'DE', name: { en: 'Germany', th: 'เยอรมนี' } },
  { code: 'FR', name: { en: 'France', th: 'ฝรั่งเศส' } },
  { code: 'US', name: { en: 'United States', th: 'สหรัฐอเมริกา' } },
  { code: 'CA', name: { en: 'Canada', th: 'แคนาดา' } },
  { code: 'AU', name: { en: 'Australia', th: 'ออสเตรเลีย' } },
  { code: 'NZ', name: { en: 'New Zealand', th: 'นิวซีแลนด์' } },
]

const COUNTRY_CODES = new Set(PAYOUT_COUNTRIES.map((c) => c.code))

export function isPayoutCountry(code: string): boolean {
  return COUNTRY_CODES.has(code.toUpperCase())
}

/**
 * Thai banks, with the SWIFT code each one uses.
 *
 * Only Thailand gets a list. Almost every teacher banks here, the set is small
 * and barely changes, and picking from it fills in the SWIFT code — which is
 * eight characters of nothing-in-particular and the single most mistyped field
 * on the form. Everywhere else the bank is typed, because a list that is
 * missing somebody's bank stops them being paid.
 */
export const THAI_BANKS: { swift: string; name: { en: string; th: string } }[] = [
  { swift: 'BKKBTHBK', name: { en: 'Bangkok Bank', th: 'ธนาคารกรุงเทพ' } },
  { swift: 'KASITHBK', name: { en: 'Kasikornbank', th: 'ธนาคารกสิกรไทย' } },
  { swift: 'KRTHTHBK', name: { en: 'Krungthai Bank', th: 'ธนาคารกรุงไทย' } },
  { swift: 'SICOTHBK', name: { en: 'Siam Commercial Bank', th: 'ธนาคารไทยพาณิชย์' } },
  { swift: 'AYUDTHBK', name: { en: 'Bank of Ayudhya (Krungsri)', th: 'ธนาคารกรุงศรีอยุธยา' } },
  { swift: 'TMBKTHBK', name: { en: 'TTB Bank', th: 'ธนาคารทีเอ็มบีธนชาต' } },
  { swift: 'UBOBTHBK', name: { en: 'United Overseas Bank (Thai)', th: 'ธนาคารยูโอบี' } },
  { swift: 'KIFITHB1', name: { en: 'Kiatnakin Phatra Bank', th: 'ธนาคารเกียรตินาคินภัทร' } },
  { swift: 'THBKTHBK', name: { en: 'CIMB Thai Bank', th: 'ธนาคารซีไอเอ็มบี ไทย' } },
  { swift: 'GSBATHBK', name: { en: 'Government Savings Bank', th: 'ธนาคารออมสิน' } },
  { swift: 'BAABTHBK', name: { en: 'Bank for Agriculture (BAAC)', th: 'ธนาคารเพื่อการเกษตร (ธ.ก.ส.)' } },
  { swift: 'GOHUTHB1', name: { en: 'Government Housing Bank', th: 'ธนาคารอาคารสงเคราะห์' } },
  { swift: 'LAHRTHB2', name: { en: 'Land and Houses Bank', th: 'ธนาคารแลนด์ แอนด์ เฮ้าส์' } },
  { swift: 'TIBTTHBK', name: { en: 'Thai Credit Bank', th: 'ธนาคารไทยเครดิต' } },
  { swift: 'ICBKTHBK', name: { en: 'ICBC (Thai)', th: 'ธนาคารไอซีบีซี (ไทย)' } },
  { swift: 'SMBCTHBK', name: { en: 'Sumitomo Mitsui (Thai)', th: 'ธนาคารซูมิโตโม มิตซุย' } },
]

/**
 * The shape of a SWIFT/BIC code.
 *
 * Four letters for the bank, two for the country, two for the place, and
 * optionally three more for a branch. Checked as a shape rather than against a
 * register: there is no free list of every valid code, and refusing a real one
 * because it is not in our copy would stop a payment for no reason. This
 * catches the mistakes people actually make — a digit where a letter goes, a
 * code of the wrong length, a bank name typed into the wrong box.
 */
const BIC = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

export function isSwift(code: string): boolean {
  return BIC.test(code.toUpperCase())
}

/** The country a SWIFT code says it belongs to — characters five and six. */
export function countryOfSwift(code: string): string | null {
  return isSwift(code) ? code.toUpperCase().slice(4, 6) : null
}
