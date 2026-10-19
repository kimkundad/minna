/* ==========================================================================
   READ VPN Learning — Mock Data (PROTOTYPE ONLY)
   ข้อมูลทั้งหมดเป็น Mockup เพื่อใช้ Prototype เท่านั้น ไม่ใช่หลักสูตรรับรองจริง
   ชื่ออาจารย์ ราคา CE และ Certificate เป็นข้อมูลจำลอง
   COURSE-001..007 = Full mock courses ตามเอกสาร §30 (ข้อความตรงตามเอกสาร)
   COURSE-008..012 = คอร์สเสริมแบบ lite (isMock + lite) เพื่อสาธิตคอร์สฟรี / ผู้สอน 3 คน /
                     การบรรยายภาษาอังกฤษ / ระดับสูง / คอร์สที่ไม่รวมในแพ็กเกจ
   correctAnswer เก็บไว้เพื่อ Auto-score ภายในเท่านั้น — ห้าม Render แก่ Learner
   ========================================================================== */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {};

  /* ---------------- Categories (24) ---------------- */
  var categories = [
    ['anesthesiology', 'Anesthesiology', 'วิสัญญีวิทยา', 'syringe', 1],
    ['aquatic-corner', 'Aquatic Corner', 'สัตว์น้ำ', 'fish', 0],
    ['behavior', 'Behavior', 'พฤติกรรมสัตว์', 'paw', 2],
    ['cardiology', 'Cardiology', 'หัวใจและหลอดเลือด', 'heart-pulse', 5],
    ['dermatology', 'Dermatology', 'ผิวหนัง', 'layers', 2],
    ['drug-corner', 'Drug Corner', 'ยาและเภสัชวิทยา', 'pill', 1],
    ['emergency-medicine', 'Emergency Medicine', 'เวชศาสตร์ฉุกเฉิน', 'siren', 5],
    ['equine-corner', 'Equine Corner', 'ม้า', 'horseshoe', 2],
    ['exotic-corner', 'Exotic Corner', 'สัตว์เลี้ยงพิเศษ', 'rabbit', 3],
    ['feline-medicine', 'Feline Medicine', 'อายุรศาสตร์แมว', 'cat', 1],
    ['gynecology', 'Gynecology', 'ระบบสืบพันธุ์', 'venus', 5],
    ['imaging-diagnosis', 'Imaging Diagnosis', 'ภาพวินิจฉัย', 'scan', 0],
    ['immunology', 'Immunology', 'ภูมิคุ้มกันวิทยา', 'shield', 3],
    ['infographic', 'Infographic', 'อินโฟกราฟิก', 'pie-chart', 4],
    ['internal-medicine', 'Internal Medicine', 'อายุรศาสตร์', 'stethoscope', 0],
    ['neurology', 'Neurology', 'ระบบประสาท', 'brain', 1],
    ['nutrition', 'Nutrition', 'โภชนาการ', 'apple', 3],
    ['oncology', 'Oncology', 'มะเร็งวิทยา', 'microscope', 4],
    ['ophthalmology', 'Ophthalmology', 'จักษุวิทยา', 'eye', 0],
    ['orthopedics', 'Orthopedics', 'กระดูกและข้อ', 'bone', 4],
    ['parasitology', 'Parasitology', 'ปรสิตวิทยา', 'bug', 3],
    ['pediatrics', 'Pediatrics', 'กุมารเวชศาสตร์สัตว์', 'baby', 2],
    ['surgery', 'Surgery', 'ศัลยกรรม', 'scissors', 1],
    ['urology', 'Urology', 'ระบบทางเดินปัสสาวะ', 'droplet', 0]
  ].map(function (c) { return { id: c[0], name: c[1], th: c[2], icon: c[3], palette: c[4] }; });

  /* Profile Interest taxonomy (โครงสร้างสมาชิกเดิม — ไม่ต้องเหมือน Course Category 100%) */
  var interests = ['All', 'Aquatic Corner', 'Cardiology', 'Dermatology', 'Drug Corner', 'Equine Corner', 'Exotic Corner',
    'Imaging Diagnosis', 'Internal Medicine', 'Nutrition', 'Parasitology', 'Surgery', 'Urology', 'Vet Business', 'Vpeople'];

  /* ---------------- Instructors (ข้อมูลจำลอง) ---------------- */
  var instructors = {
    'INS-01': { name: 'สพ.ญ. ดร. ชลธิชา พรหมรักษ์', short: 'ชลธิชา พรหมรักษ์', initials: 'ชพ', color: 0, specialty: 'Clinical Pathology', photo: null },
    'INS-02': { name: 'น.สพ. ดร. ภาคิน อมรวิทย์', short: 'ภาคิน อมรวิทย์', initials: 'ภอ', color: 4, specialty: 'Small Animal Internal Medicine', photo: null },
    'INS-03': { name: 'น.สพ. ดร. กิตติพงศ์ วัฒนเวช', short: 'กิตติพงศ์ วัฒนเวช', initials: 'กว', color: 5, specialty: 'Emergency & Critical Care', photo: null },
    'INS-04': { name: 'สพ.ญ. พิมพ์ชนก วัฒนศิริ', short: 'พิมพ์ชนก วัฒนศิริ', initials: 'พว', color: 3, specialty: 'Small Animal Practice', photo: null },
    'INS-05': { name: 'รศ. สพ.ญ. ดร. นลินี ศรีสุข', short: 'นลินี ศรีสุข', initials: 'นศ', color: 1, specialty: 'Feline Medicine', photo: null },
    'INS-06': { name: 'สพ.ญ. ดร. สิริกานต์ อภิรักษ์', short: 'สิริกานต์ อภิรักษ์', initials: 'สอ', color: 2, specialty: 'Internal Medicine', photo: null },
    'INS-07': { name: 'สพ.ญ. ดร. พราวพรรณ จิตมั่น', short: 'พราวพรรณ จิตมั่น', initials: 'พจ', color: 5, specialty: 'Veterinary Dermatology', photo: null },
    'INS-08': { name: 'สพ.ญ. ดร. รวิสรา ชัยเวช', short: 'รวิสรา ชัยเวช', initials: 'รช', color: 1, specialty: 'Veterinary Anesthesia', photo: null },
    'INS-09': { name: 'น.สพ. ดร. ธนกร พัฒนกิจ', short: 'ธนกร พัฒนกิจ', initials: 'ธพ', color: 4, specialty: 'Surgery & Anesthesia', photo: null },
    'INS-10': { name: 'สพ.ญ. ณัฐณิชา วัฒนกุล', short: 'ณัฐณิชา วัฒนกุล', initials: 'ณว', color: 3, specialty: 'Cat-friendly Practice', photo: null },
    'INS-11': { name: 'สพ.ญ. กมลวรรณ ศรีประเสริฐ', short: 'กมลวรรณ ศรีประเสริฐ', initials: 'กศ', color: 3, specialty: 'Clinical Nutrition', photo: null },
    'INS-12': { name: 'น.สพ. ดร. วรเมธ ศักดิ์สกุล', short: 'วรเมธ ศักดิ์สกุล', initials: 'วศ', color: 0, specialty: 'Small Animal Internal Medicine', photo: null },
    'INS-13': { name: 'Dr. Sarah Mitchell, DVM', short: 'Sarah Mitchell', initials: 'SM', color: 1, specialty: 'Veterinary Cardiology', photo: null },
    'INS-14': { name: 'น.สพ. ดร. อัครพล เกียรติวงศ์', short: 'อัครพล เกียรติวงศ์', initials: 'อก', color: 4, specialty: 'Echocardiography', photo: null },
    'INS-15': { name: 'สพ.ญ. ดร. ปวีณา แสงทอง', short: 'ปวีณา แสงทอง', initials: 'ปส', color: 5, specialty: 'Small Animal Cardiology', photo: null },
    'INS-16': { name: 'น.สพ. ดร. ธีรวัฒน์ บุญญาศิริ', short: 'ธีรวัฒน์ บุญญาศิริ', initials: 'ธบ', color: 2, specialty: 'Orthopedic Surgery', photo: null },
    'INS-17': { name: 'สพ.ญ. ดร. ศศิธร วงศ์ใหญ่', short: 'ศศิธร วงศ์ใหญ่', initials: 'ศว', color: 3, specialty: 'Veterinary Rehabilitation', photo: null },
    'INS-18': { name: 'สพ.ญ. ดร. อรุณี ทองประเสริฐ', short: 'อรุณี ทองประเสริฐ', initials: 'อท', color: 0, specialty: 'Exotic Animal Medicine', photo: null }
  };
  Object.keys(instructors).forEach(function (k) {
    var i = instructors[k]; i.id = k; i.isMock = true;
    i.bio = '(ข้อมูลจำลอง) ผู้สอนด้าน ' + i.specialty + ' มีประสบการณ์ด้านเวชปฏิบัติและการสอนบุคลากรวิชาชีพสัตวแพทย์ เนื้อหาเน้นการนำไปใช้กับงานคลินิกจริง';
  });

  /* ---------------- helpers for course definition ---------------- */
  var LEVEL = { beginner: 'เริ่มต้น', intermediate: 'ระดับกลาง', advanced: 'ระดับสูง' };
  function toSec(mmss) { if (!mmss) return 0; var p = mmss.split(':'); return (+p[0]) * 60 + (+p[1]); }
  /* L(title, type, duration, opts) ; type: video | pdf | quiz */
  function L(title, type, dur, o) { o = o || {}; return { title: title, type: type, duration: dur || null, sec: toSec(dur), preview: !!o.preview, subtitle: o.subtitle || null, hasPdf: !!o.hasPdf }; }
  function M(title, lessons) { return { title: title, lessons: lessons }; }
  function single(text, choices, correct) { return { type: 'single', text: text, choices: choices, correctAnswer: [correct] }; }
  function multi(text, choices, correct) { return { type: 'multiple', text: text, choices: choices, correctAnswer: correct }; }
  function essay(text) { return { type: 'essay', text: text, maxLength: 1000, attachmentAllowed: true }; }

  var COMPLETION = [
    'เรียนครบทุกบทเรียน — ระบบบันทึกอัตโนมัติเมื่อดูวิดีโอครบตามเกณฑ์ (≥ 90%) หรือเปิดเอกสารครบ',
    'ผ่านแบบทดสอบข้อเลือกตอบ ≥ 80% (ทำใหม่ได้ไม่จำกัด)',
    'Essay ผ่านการตรวจจากผู้สอน',
    'เมื่อครบทุกเงื่อนไข ระบบบันทึก CE และออกใบประกาศให้อัตโนมัติ'
  ];

  /* ---------------- Courses ---------------- */
  var courses = [
    {
      id: 'COURSE-001',
      title: 'การแปลผล CBC ในสุนัขและแมวสำหรับเวชปฏิบัติ',
      category: 'imaging-diagnosis', level: 'beginner', language: 'th',
      durationMin: 200, durationLabel: '3 ชั่วโมง 20 นาที', ce: 3,
      price: 1290, normalPrice: 1590, badge: 'bestseller', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-03-12', updatedAt: '2026-08-30', popularity: 1, featured: true,
      instructors: [{ id: 'INS-01', role: 'Clinical Pathology' }, { id: 'INS-02', role: 'Small Animal Internal Medicine' }],
      image: { src: 'assets/img/04-siamese-cat-16x9.png', alt: 'แมวพันธุ์วิเชียรมาศบนพื้นหลังสีแบรนด์' },
      shortDesc: 'อ่านผล Complete Blood Count อย่างเป็นระบบ ตั้งแต่เม็ดเลือดแดง เม็ดเลือดขาว และเกล็ดเลือด จนถึงการเชื่อมผล Lab กับอาการทางคลินิกของผู้ป่วยจริง',
      outcomes: ['เข้าใจองค์ประกอบพื้นฐานของ CBC', 'ประเมินภาวะโลหิตจางเบื้องต้น', 'วิเคราะห์รูปแบบเม็ดเลือดขาว', 'ประเมิน Platelet จากข้อมูลพื้นฐาน', 'เชื่อมผล Lab กับ Clinical Context'],
      audience: ['สัตวแพทย์เวชปฏิบัติสัตว์เล็กที่ต้องการทบทวนการแปลผล CBC', 'สัตวแพทย์จบใหม่ที่เริ่มทำงานในคลินิกหรือโรงพยาบาลสัตว์', 'ทีมห้องปฏิบัติการที่ต้องสื่อสารผลตรวจกับสัตวแพทย์'],
      modules: [
        M('พื้นฐาน CBC', [L('บทนำและวัตถุประสงค์', 'video', '05:20', { preview: true }), L('ส่วนประกอบของเลือด', 'video', '18:40'), L('การเก็บและเตรียมตัวอย่าง', 'video', '14:10'), L('เอกสารสรุปค่าพื้นฐาน', 'pdf')]),
        M('Red Blood Cell', [L('PCV/HCT และ RBC Parameters', 'video', '22:15'), L('Regenerative vs Non-regenerative Anemia', 'video', '27:10'), L('Case Discussion: ภาวะโลหิตจาง', 'video', '20:45')]),
        M('White Blood Cell & Platelet', [L('Leukogram Pattern', 'video', '31:20'), L('Platelet Evaluation', 'video', '17:50'), L('Case Discussion', 'video', '22:10')]),
        M('Assessment', [L('Summary', 'video', '08:00'), L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: การแปลผล CBC ในสุนัขและแมว', passPct: 80, timerMin: null,
        questions: [
          single('ค่าใดเป็นข้อมูลหลักที่ใช้ประเมินภาวะโลหิตจางเบื้องต้น', ['PCV/HCT', 'ALT', 'Creatinine', 'Glucose'], 0),
          multi('ปัจจัยใดอาจกระทบความน่าเชื่อถือของผล CBC', ['ตัวอย่างเกิดลิ่มเลือด', 'ระยะเวลารอก่อนตรวจนานเกินไป', 'วิธีการเก็บตัวอย่าง', 'ชื่อเจ้าของสัตว์'], [0, 1, 2]),
          single('Reticulocyte มีประโยชน์หลักในบริบทใด', ['ประเมินการตอบสนองของไขกระดูกต่อภาวะโลหิตจาง', 'ประเมินระดับน้ำตาล', 'ประเมินการทำงานไตโดยตรง', 'ประเมินอุณหภูมิ'], 0),
          multi('ข้อมูลใดควรใช้ร่วมกับ CBC ในการแปลผล', ['Clinical Signs', 'Physical Examination', 'Patient History', 'สีของหน้าจอคอมพิวเตอร์'], [0, 1, 2]),
          single('เมื่อผลตรวจไม่สอดคล้องกับอาการผู้ป่วย ควรทำอย่างไร', ['ทบทวน Sample Quality และ Clinical Context', 'สรุปจากค่าเดียวทันที', 'ละเว้นประวัติ', 'เปลี่ยนชื่อผู้ป่วย'], 0),
          essay('อธิบายแนวทางเชื่อมโยงผล CBC กับประวัติและอาการทางคลินิกของผู้ป่วย 1 เคส')
        ]
      }
    },
    {
      id: 'COURSE-002',
      title: 'Emergency Triage การคัดกรองสัตว์ป่วยฉุกเฉิน',
      category: 'emergency-medicine', level: 'intermediate', language: 'th',
      durationMin: 250, durationLabel: '4 ชั่วโมง 10 นาที', ce: 4,
      price: 1690, normalPrice: 1990, badge: 'recommended', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-06-02', updatedAt: '2026-09-05', popularity: 2, featured: true,
      instructors: [{ id: 'INS-03', role: 'Emergency & Critical Care' }, { id: 'INS-04', role: 'Small Animal Practice' }],
      image: { src: 'assets/img/05-scarlet-macaw-16x9.png', alt: 'นกมาคอว์สีแดงบนพื้นหลังสีแบรนด์' },
      shortDesc: 'วางระบบคัดกรองผู้ป่วยฉุกเฉินตั้งแต่หน้าเคาน์เตอร์ จัดลำดับความเร่งด่วนด้วย Primary Survey และ ABC Assessment พร้อมการสื่อสารและ Handover ในทีม',
      outcomes: ['เข้าใจเป้าหมายและกรอบการทำ Triage', 'ประเมิน Primary Survey และ ABC Assessment ได้อย่างเป็นระบบ', 'จัดลำดับความเร่งด่วนของผู้ป่วยได้เหมาะสม', 'สื่อสารกับเจ้าของสัตว์และส่งต่อข้อมูลในทีมได้ชัดเจน'],
      audience: ['สัตวแพทย์ที่ปฏิบัติงานห้องฉุกเฉินหรือรับเคสนอกเวลา', 'ทีมผู้ช่วยสัตวแพทย์และทีมหน้าเคาน์เตอร์', 'คลินิกที่ต้องการวางมาตรฐานการรับผู้ป่วยฉุกเฉิน'],
      modules: [
        M('Triage Framework', [L('เป้าหมายของ Triage', 'video', '12:00', { preview: true }), L('Primary Survey', 'video', '25:30'), L('การจัดลำดับความเร่งด่วน', 'video', '20:00')]),
        M('ABC Assessment', [L('Airway', 'video', '18:20'), L('Breathing', 'video', '22:10'), L('Circulation', 'video', '26:00'), L('Neurologic Quick Check', 'video', '15:40')]),
        M('Communication', [L('การรับ Case หน้าเคาน์เตอร์', 'video', '18:00'), L('การสื่อสารกับเจ้าของสัตว์', 'video', '24:10'), L('Handover ในทีม', 'video', '16:30')]),
        M('Case Simulation', [L('Case A: Dyspnea', 'video', '28:00'), L('Case B: Trauma', 'video', '30:00'), L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Emergency Triage', passPct: 80, timerMin: 15,
        questions: [
          single('เป้าหมายสำคัญของ Triage คือข้อใด', ['จัดลำดับผู้ป่วยตามความเร่งด่วน', 'เรียงตามเวลาที่มาถึงเท่านั้น', 'Final Diagnosis ทันทีทุกเคส', 'คำนวณค่าใช้จ่ายก่อนประเมิน'], 0),
          multi('สิ่งใดอยู่ใน Primary Survey', ['Airway', 'Breathing', 'Circulation', 'ประวัติการฉีดวัคซีนย้อนหลังทุกปีแบบละเอียด'], [0, 1, 2]),
          single('ผู้ป่วยที่มีภาวะหายใจลำบากควรได้รับการจัดการอย่างไร', ['ประเมินและช่วยเหลือเร่งด่วน', 'รอตามคิวปกติ', 'ให้กลับบ้านก่อน', 'ทำเอกสารทั้งหมดก่อน'], 0),
          multi('ข้อมูล Handover ที่มีประโยชน์ประกอบด้วย', ['สัญญาณชีพ', 'สิ่งที่ได้ดำเนินการไปแล้ว', 'การเปลี่ยนแปลงอาการ', 'ความชอบสีของเจ้าของสัตว์'], [0, 1, 2]),
          single('Triage แตกต่างจาก Final Diagnosis อย่างไร', ['Triage เน้นความเร่งด่วน ส่วน Diagnosis เน้นหาสาเหตุ', 'เป็นสิ่งเดียวกัน', 'Triage ใช้หลังรักษาเสร็จ', 'Diagnosis ไม่ใช้ข้อมูลผู้ป่วย'], 0),
          essay('เขียนแนวทางการรับผู้ป่วยฉุกเฉินที่มีอาการหายใจลำบากตั้งแต่จุดรับผู้ป่วยจนถึงส่งต่อทีมรักษา')
        ]
      }
    },
    {
      id: 'COURSE-003',
      title: 'แนวทางดูแลแมวโรคไตเรื้อรังในคลินิก',
      category: 'feline-medicine', level: 'intermediate', language: 'th',
      durationMin: 300, durationLabel: '5 ชั่วโมง', ce: 5,
      price: 1890, normalPrice: 2290, badge: 'ce', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-01-20', updatedAt: '2026-07-14', popularity: 3, featured: true,
      instructors: [{ id: 'INS-05', role: 'Feline Medicine' }, { id: 'INS-06', role: 'Internal Medicine' }],
      image: { id: 'photo-1725409796872-8b41e8eca929', alt: 'สัตวแพทย์ตรวจร่างกายลูกแมว' },
      shortDesc: 'ภาพรวมโรคไตเรื้อรังในแมว ตั้งแต่ Risk Factors การตรวจวินิจฉัย การจัดการด้านโภชนาการและน้ำ ไปจนถึงการติดตามระยะยาวและการสื่อสารกับเจ้าของ',
      outcomes: ['อธิบายภาพรวมและปัจจัยเสี่ยงของ CKD ในแมว', 'วางแผน Diagnostic Workup ได้เหมาะสม', 'เลือกแนวทาง Management ด้านโภชนาการและ Hydration', 'ออกแบบแผนติดตามระยะยาวและการสื่อสารกับเจ้าของ'],
      audience: ['สัตวแพทย์ที่ดูแลผู้ป่วยแมวสูงวัยเป็นประจำ', 'คลินิกที่ต้องการวางแนวทางติดตามผู้ป่วย CKD', 'สัตวแพทย์ที่สนใจ Feline Medicine'],
      modules: [
        M('CKD Overview', [L('ภาพรวม CKD ในแมว', 'video', '20:00', { preview: true }), L('Risk Factors', 'video', '18:30'), L('Clinical Presentation', 'video', '24:00')]),
        M('Diagnostic Workup', [L('History & Physical Examination', 'video', '22:00'), L('Laboratory Interpretation', 'video', '32:00'), L('Blood Pressure & Urinalysis', 'video', '25:00')]),
        M('Management', [L('Nutrition', 'video', '30:00'), L('Hydration Strategy', 'video', '28:00'), L('Monitoring', 'video', '26:00')]),
        M('Communication', [L('Long-term Follow-up', 'video', '20:00'), L('Owner Communication', 'video', '18:00'), L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: การดูแลแมวโรคไตเรื้อรัง', passPct: 80, timerMin: null,
        questions: [
          single('การติดตาม CKD ควรพิจารณาข้อมูลใด', ['แนวโน้มข้อมูลหลายด้านร่วมกัน', 'ค่าใดค่าหนึ่งเพียงครั้งเดียวเสมอ', 'สีของกรง', 'น้ำหนักเจ้าของสัตว์'], 0),
          multi('ข้อมูลที่มีประโยชน์ในการติดตามผู้ป่วย', ['น้ำหนักตัว', 'Appetite', 'Hydration', 'Laboratory Trend'], [0, 1, 2, 3]),
          single('เหตุผลของการติดตามเป็นระยะคือข้อใด', ['ประเมินแนวโน้มและปรับแผนดูแล', 'เปลี่ยนชื่อผู้ป่วย', 'ยกเลิกประวัติเดิม', 'ไม่ต้องสื่อสารกับเจ้าของ'], 0),
          multi('การสื่อสารกับเจ้าของควรครอบคลุม', ['เป้าหมายการดูแล', 'สิ่งที่ต้องสังเกตที่บ้าน', 'แผนติดตาม', 'การรับประกันผลลัพธ์ 100%'], [0, 1, 2]),
          single('แนวคิดที่เหมาะสมในการใช้ข้อมูล Lab คือ', ['ใช้ร่วมกับ Clinical Context', 'อ่านแยกจากผู้ป่วยเสมอ', 'ไม่ต้องติดตาม Trend', 'ใช้เฉพาะผลเก่าที่สุด'], 0),
          essay('ออกแบบแผนติดตามผู้ป่วยแมว CKD แบบย่อ โดยระบุข้อมูลที่ควรติดตามและวิธีสื่อสารกับเจ้าของ')
        ]
      }
    },
    {
      id: 'COURSE-004',
      title: 'Dermatology Essentials: Approach to Common Skin Problems',
      category: 'dermatology', level: 'beginner', language: 'th',
      durationMin: 165, durationLabel: '2 ชั่วโมง 45 นาที', ce: 2,
      price: 990, normalPrice: 1290, badge: 'new', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-09-08', updatedAt: '2026-09-15', popularity: 5, featured: false,
      instructors: [{ id: 'INS-07', role: 'Veterinary Dermatology' }],
      image: { src: 'assets/img/01-golden-retriever-16x9.png', alt: 'สุนัขพันธุ์โกลเด้นรีทรีฟเวอร์บนพื้นหลังสีแบรนด์' },
      shortDesc: 'Workflow การประเมินปัญหาผิวหนังที่พบบ่อยในคลินิก ตั้งแต่ Dermatology History การอธิบาย Lesion และ Distribution ไปจนถึง Basic Diagnostics และการวางแผน Follow-up',
      outcomes: ['เก็บ Dermatology History ได้ครบถ้วน', 'อธิบาย Lesion และ Distribution Pattern อย่างเป็นระบบ', 'เลือกใช้ Basic Diagnostics เช่น Skin Scraping และ Cytology', 'วางแผน Follow-up และประเมิน Response'],
      audience: ['สัตวแพทย์เวชปฏิบัติทั่วไปที่พบเคสผิวหนังบ่อย', 'สัตวแพทย์จบใหม่ที่ต้องการ Workflow ผิวหนังแบบเป็นขั้นตอน', 'นักศึกษาสัตวแพทย์ชั้นคลินิก'],
      modules: [
        M('Dermatology Workflow', [L('Dermatology History', 'video', '18:00', { preview: true }), L('Lesion Description', 'video', '22:00'), L('Distribution Pattern', 'video', '18:30')]),
        M('Basic Diagnostics', [L('Skin Scraping', 'video', '20:00'), L('Cytology Overview', 'video', '24:00'), L('Ear Cytology Overview', 'video', '18:00')]),
        M('Case Approach', [L('Pruritic Patient', 'video', '28:00'), L('Alopecia Case', 'video', '25:00'), L('Follow-up Plan', 'video', '16:00')]),
        M('Quiz', [L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Dermatology Essentials', passPct: 80, timerMin: null,
        questions: [
          single('ขั้นตอนแรกที่ช่วยให้การประเมินปัญหาผิวหนังเป็นระบบคือ', ['เก็บ History และอธิบาย Lesion', 'เลือกยาโดยไม่ตรวจ', 'ดูภาพเพียงอย่างเดียว', 'ละเว้น Distribution'], 0),
          multi('ข้อมูลสำคัญใน Dermatology History ได้แก่', ['ระยะเวลาที่เป็น', 'ระดับอาการคัน', 'การรักษาที่เคยได้รับ', 'สีปลอกคอ'], [0, 1, 2]),
          single('การอธิบาย Distribution มีประโยชน์อย่างไร', ['ช่วยสร้าง Differential Diagnosis', 'ไม่มีผล', 'ใช้แทนการตรวจทั้งหมด', 'ใช้ระบุเจ้าของสัตว์'], 0),
          multi('Basic Test อาจประกอบด้วย', ['Cytology', 'Skin Scraping', 'Ear Cytology', 'การชั่งน้ำหนักโต๊ะ'], [0, 1, 2]),
          single('เมื่อรักษาแล้วควรทำสิ่งใด', ['วางแผน Follow-up และประเมิน Response', 'ยกเลิกข้อมูลก่อนหน้า', 'หยุดติดตามทุกกรณี', 'เปลี่ยน Diagnosis อัตโนมัติ'], 0),
          essay('ยกตัวอย่าง Workflow การประเมินผู้ป่วยที่มาด้วยอาการคัน ตั้งแต่ซักประวัติจนถึงวางแผนตรวจเบื้องต้น')
        ]
      }
    },
    {
      id: 'COURSE-005',
      title: 'พื้นฐาน Ultrasound ช่องท้องสำหรับสัตวแพทย์',
      category: 'imaging-diagnosis', level: 'beginner', language: 'th',
      durationMin: 390, durationLabel: '6 ชั่วโมง 30 นาที', ce: 6,
      price: 2490, normalPrice: null, badge: 'expired', packageIncluded: false,
      status: 'ended', endedAt: '2026-06-30', sellable: false, repurchase: false, expiredType: 'A',
      publishedAt: '2025-04-01', updatedAt: '2026-01-10', popularity: 4, featured: false,
      instructors: [{ id: 'INS-02', role: 'Diagnostic Imaging' }, { id: 'INS-01', role: 'Diagnostic Support' }],
      image: { id: 'photo-1770836037183-e0b4471fe2c0', alt: 'สัตวแพทย์ทำ Ultrasound ให้สุนัข' },
      shortDesc: 'พื้นฐานการใช้เครื่อง Ultrasound และหัว Probe การเตรียมผู้ป่วย การสำรวจอวัยวะในช่องท้อง และการบันทึกภาพเพื่อจัดทำรายงานเบื้องต้น',
      outcomes: ['ตั้งค่าเครื่องและจับ Probe ได้ถูกต้อง', 'วางแผนการ Scan และเตรียมผู้ป่วย', 'สำรวจ Liver, Spleen, Kidney และ Urinary Bladder อย่างเป็นระบบ', 'บันทึกภาพและเขียนรายงานเบื้องต้น'],
      audience: ['สัตวแพทย์ที่เริ่มใช้ Ultrasound ในคลินิก', 'สัตวแพทย์ที่ต้องการทบทวน Orientation และ Scan Plan', 'ทีมที่ต้องการมาตรฐานการบันทึกภาพ'],
      modules: [
        M('Machine & Probe', [L('Orientation', 'video', '20:00', { preview: true }), L('Probe Handling', 'video', '25:00'), L('Basic Settings', 'video', '30:00')]),
        M('Scan Preparation', [L('Patient Preparation', 'video', '18:00'), L('Scan Plan', 'video', '20:00'), L('Artifact Awareness', 'video', '24:00')]),
        M('Organ Survey', [L('Liver', 'video', '32:00'), L('Spleen', 'video', '25:00'), L('Kidney', 'video', '35:00'), L('Urinary Bladder', 'video', '22:00')]),
        M('Reporting', [L('Image Documentation', 'video', '20:00'), L('Basic Report — PDF + Video', 'video', '15:00', { hasPdf: true }), L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: พื้นฐาน Ultrasound ช่องท้อง', passPct: 80, timerMin: null,
        questions: [
          single('การตั้ง Orientation ที่สม่ำเสมอช่วยเรื่องใด', ['ลดความสับสนในการตีความตำแหน่งภาพ', 'เพิ่มความดังเสียง', 'เปลี่ยนข้อมูลผู้ป่วย', 'ลดขนาดหน้าจอ'], 0),
          multi('สิ่งที่ควรเตรียมก่อน Scan', ['Patient Information', 'Probe', 'Machine Setting', 'แผนการตรวจ'], [0, 1, 2, 3]),
          single('เหตุผลของการเก็บภาพมาตรฐานคือ', ['ใช้เปรียบเทียบและบันทึกข้อมูล', 'ใช้แทนรายงานทุกกรณี', 'ไม่ต้องระบุอวัยวะ', 'ทำให้ไม่ต้องตรวจผู้ป่วย'], 0),
          multi('คุณภาพภาพอาจสัมพันธ์กับ', ['Probe Position', 'Gain', 'Depth', 'Patient Preparation'], [0, 1, 2, 3]),
          single('เมื่อพบภาพผิดปกติควร', ['บันทึกภาพและตีความร่วมกับบริบท', 'สรุปสาเหตุทันทีโดยไม่ใช้ข้อมูลอื่น', 'ลบภาพ', 'เปลี่ยนชื่อไฟล์อย่างเดียว'], 0),
          essay('อธิบาย Checklist ก่อนเริ่มตรวจ Ultrasound ช่องท้องเพื่อให้ได้ภาพที่สม่ำเสมอ')
        ]
      }
    },
    {
      id: 'COURSE-006',
      title: 'Anesthesia Monitoring Essentials',
      category: 'anesthesiology', level: 'intermediate', language: 'th',
      durationMin: 240, durationLabel: '4 ชั่วโมง', ce: 4,
      price: 1790, normalPrice: 2090, badge: null, packageIncluded: false,
      status: 'active', sellable: true, repurchase: true, expiredType: 'B',
      publishedAt: '2025-07-15', updatedAt: '2026-05-02', popularity: 6, featured: false,
      resumeLessonTitle: 'การติดตามระบบไหลเวียน',
      instructors: [{ id: 'INS-08', role: 'Veterinary Anesthesia' }, { id: 'INS-09', role: 'Surgery & Anesthesia' }],
      image: { id: 'photo-1688565631957-0306970fdd74', alt: 'ถาดเครื่องมือผ่าตัดที่จัดเตรียมไว้' },
      shortDesc: 'ติดตามผู้ป่วยระหว่างการวางยาสลบอย่างเป็นระบบ ทั้ง Respiratory, Cardiovascular และ Temperature การอ่าน Trend และการสื่อสารในทีมจนถึงช่วง Recovery',
      outcomes: ['กำหนดเป้าหมายและขั้นตอน Monitoring ก่อนวางยาสลบ', 'ติดตาม Core Parameters ได้อย่างต่อเนื่อง', 'อ่าน Trend ของข้อมูลเพื่อช่วยตัดสินใจ', 'ดูแลผู้ป่วยในช่วง Recovery อย่างปลอดภัย'],
      audience: ['สัตวแพทย์ที่ทำหัตถการภายใต้การวางยาสลบ', 'ผู้ช่วยสัตวแพทย์ที่รับผิดชอบการ Monitoring', 'ทีมผ่าตัดที่ต้องการภาษาการสื่อสารร่วมกัน'],
      modules: [
        M('Monitoring Fundamentals', [L('Monitoring Objective', 'video', '16:00', { preview: true }), L('Pre-anesthetic Check', 'video', '20:00'), L('Monitoring Record', 'pdf')]),
        M('Core Parameters', [L('Respiratory Monitoring', 'video', '30:00'), L('Cardiovascular Monitoring', 'video', '30:00', { subtitle: 'การติดตามระบบไหลเวียน' }), L('Temperature', 'video', '18:00')]),
        M('Response', [L('Recognizing Trends', 'video', '25:00'), L('Team Communication', 'video', '20:00'), L('Recovery Monitoring', 'video', '25:00')]),
        M('Quiz', [L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Anesthesia Monitoring Essentials', passPct: 80, timerMin: null,
        questions: [
          single('เป้าหมายของ Monitoring ระหว่างวางยาสลบคือ', ['ติดตามการเปลี่ยนแปลงของผู้ป่วยอย่างต่อเนื่อง', 'บันทึกชื่อผู้ป่วยอย่างเดียว', 'ลดจำนวนบุคลากรเสมอ', 'ใช้แทน Clinical Assessment ทั้งหมด'], 0),
          multi('ข้อมูลที่ควรติดตามแบบเป็นระบบอาจประกอบด้วย', ['Respiratory Parameter', 'Cardiovascular Parameter', 'Temperature', 'Trend ของข้อมูล'], [0, 1, 2, 3]),
          single('การดู Trend สำคัญเพราะ', ['ช่วยเห็นการเปลี่ยนแปลงต่อเนื่อง', 'ค่าเดียวบอกทุกอย่างเสมอ', 'ไม่ต้องบันทึกเวลา', 'ใช้เพื่อความสวยงามของกราฟ'], 0),
          multi('Recovery Monitoring ควรคำนึงถึง', ['Airway', 'Breathing', 'Temperature', 'Level of Responsiveness'], [0, 1, 2, 3]),
          single('เมื่อพบ Parameter เปลี่ยนผิดปกติ ควร', ['ประเมินความถูกต้องของข้อมูลและตอบสนองตามบริบท', 'ปิด Monitor', 'ลบ Record', 'รอจนสิ้นสุด Procedure เสมอ'], 0),
          essay('อธิบายวิธีใช้ข้อมูล Monitoring แบบ Trend เพื่อช่วยทีมตัดสินใจระหว่างการวางยาสลบ')
        ]
      }
    },
    {
      id: 'COURSE-007',
      title: 'Feline Behavior: ลดความเครียดของแมวในคลินิก',
      category: 'behavior', level: 'beginner', language: 'th',
      durationMin: 150, durationLabel: '2 ชั่วโมง 30 นาที', ce: 2,
      price: 1190, normalPrice: 1390, badge: null, packageIncluded: false,
      status: 'active', sellable: true, repurchase: true, expiredType: 'B',
      publishedAt: '2025-03-10', updatedAt: '2026-02-18', popularity: 7, featured: false,
      instructors: [{ id: 'INS-06', role: 'Feline Medicine & Behavior' }, { id: 'INS-10', role: 'Cat-friendly Practice' }],
      image: { id: 'photo-1549545931-59bf067af9ab', alt: 'แมวแอบมองจากหลังโต๊ะ' },
      shortDesc: 'เข้าใจ Body Language และ Stress Signal ของแมว ออกแบบ Clinic Journey แบบ Cat-friendly ตั้งแต่ห้องรอจนถึงห้องตรวจ พร้อม Low-stress Workflow สำหรับทีม',
      outcomes: ['อ่าน Body Language และ Stress Signal ของแมว', 'ลด Environmental Trigger ในคลินิก', 'ใช้ Low-stress Handling อย่างเหมาะสม', 'ออกแบบ Customer Journey แบบ Cat-friendly'],
      audience: ['สัตวแพทย์และทีมที่ดูแลผู้ป่วยแมว', 'คลินิกที่ต้องการปรับเป็น Cat-friendly Practice', 'ทีมต้อนรับที่สื่อสารกับเจ้าของแมว'],
      modules: [
        M('Cat Behavior Basics', [L('Body Language', 'video', '20:00', { preview: true }), L('Stress Signal', 'video', '22:00'), L('Environmental Trigger', 'video', '18:00')]),
        M('Clinic Journey', [L('Waiting Area', 'video', '18:00'), L('Handling', 'video', '25:00'), L('Examination Room', 'video', '24:00')]),
        M('Team Practice', [L('Communication with Owner', 'video', '20:00'), L('Low-stress Workflow', 'video', '20:00')]),
        M('Quiz', [L('Quiz — 5 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Feline Behavior', passPct: 80, timerMin: null,
        questions: [
          single('การสังเกต Body Language มีประโยชน์เพื่อ', ['ประเมินระดับความกังวลและปรับการเข้าหา', 'ระบุอายุแม่นยำเสมอ', 'แทนการตรวจร่างกาย', 'เลือกสีห้อง'], 0),
          multi('สิ่งที่อาจเพิ่ม Stress ในคลินิก', ['เสียงดัง', 'กลิ่นที่ไม่คุ้นเคย', 'การจับบังคับมากเกินไป', 'พื้นที่ที่ไม่มีจุดหลบ'], [0, 1, 2, 3]),
          single('แนวทาง Low-stress Handling คือ', ['ใช้แรงเท่าที่จำเป็นและสังเกต Response', 'ใช้แรงมากที่สุดตั้งแต่เริ่ม', 'ไม่ต้องเตรียม Environment', 'รีบทำทุกขั้นตอนโดยไม่สังเกตแมว'], 0),
          multi('การปรับ Waiting Area อาจช่วยด้วย', ['ลดสิ่งกระตุ้น', 'จัดระยะห่าง', 'ลดเสียงรบกวน', 'มีพื้นที่วาง Carrier ที่เหมาะสม'], [0, 1, 2, 3]),
          single('การสื่อสารกับเจ้าของก่อนมา Clinic ช่วยได้อย่างไร', ['ช่วยเตรียมการเดินทางและลด Trigger บางส่วน', 'ไม่มีผล', 'ใช้แทนการตรวจ', 'ทำให้ไม่ต้องนัดหมาย'], 0),
          essay('ออกแบบ Customer Journey แบบ Cat-friendly ตั้งแต่ก่อนเดินทางมาคลินิกจนถึงจบการตรวจ')
        ]
      }
    },
    /* ---------- Supplementary lite courses (ข้อมูลจำลองเพิ่มเติม) ---------- */
    {
      id: 'COURSE-008', lite: true,
      title: 'Nutrition Talk: โภชนาการสุนัขและแมวตามช่วงวัย',
      category: 'nutrition', level: 'beginner', language: 'th',
      durationMin: 60, durationLabel: '1 ชั่วโมง', ce: 0,
      price: 0, normalPrice: null, badge: null, packageIncluded: false,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-08-18', updatedAt: '2026-08-18', popularity: 8, featured: false,
      instructors: [{ id: 'INS-11', role: 'Clinical Nutrition' }],
      image: { src: 'assets/img/03-persian-cat-16x9.png', alt: 'แมวพันธุ์เปอร์เซียบนพื้นหลังสีแบรนด์' },
      shortDesc: 'คอร์สฟรีสำหรับสมาชิก สรุปหลักการประเมิน Body Condition Score ความต้องการพลังงานตามช่วงวัย และการให้คำแนะนำเรื่องอาหารแก่เจ้าของ',
      outcomes: ['ประเมิน Body Condition Score ได้ถูกต้อง', 'อธิบายความต้องการพลังงานตามช่วงวัย', 'ให้คำแนะนำการเปลี่ยนอาหารอย่างปลอดภัย'],
      audience: ['สัตวแพทย์และทีมที่ให้คำปรึกษาด้านอาหาร', 'นักศึกษาสัตวแพทย์ที่ต้องการทบทวนพื้นฐานโภชนาการ'],
      modules: [
        M('พื้นฐานโภชนาการ', [L('หลักการประเมิน Body Condition Score', 'video', '14:00', { preview: true }), L('ความต้องการพลังงานตามช่วงวัย', 'video', '16:00')]),
        M('การให้คำแนะนำเจ้าของ', [L('การเลือกอาหารสำเร็จรูป', 'video', '15:00'), L('สรุปแนวทางการให้คำแนะนำ', 'pdf'), L('Quiz — 3 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Nutrition Talk', passPct: 80, timerMin: null,
        questions: [
          single('Body Condition Score ใช้ประเมินสิ่งใดเป็นหลัก', ['สัดส่วนไขมันและรูปร่างของร่างกาย', 'สีขน', 'อายุที่แน่นอน', 'สายพันธุ์'], 0),
          multi('ปัจจัยที่ควรพิจารณาเมื่อกำหนดพลังงานที่ต้องการ', ['ช่วงวัย', 'ระดับกิจกรรม', 'สถานะการทำหมัน', 'สีของชามอาหาร'], [0, 1, 2]),
          single('เมื่อต้องเปลี่ยนสูตรอาหาร ควรแนะนำเจ้าของอย่างไร', ['ค่อย ๆ ผสมอาหารใหม่เพิ่มขึ้นภายใน 7–10 วัน', 'เปลี่ยนทันทีในมื้อเดียว', 'งดอาหาร 2 วันก่อนเปลี่ยน', 'ให้อาหารใหม่เฉพาะวันหยุด'], 0),
          essay('ยกตัวอย่างการให้คำแนะนำด้านโภชนาการแก่เจ้าของแมวที่มีน้ำหนักเกิน 1 เคส')
        ]
      }
    },
    {
      id: 'COURSE-009', lite: true,
      title: 'Internal Medicine Case Rounds: ซักประวัติและตรวจร่างกายอย่างเป็นระบบ',
      category: 'internal-medicine', level: 'beginner', language: 'th',
      durationMin: 90, durationLabel: '1 ชั่วโมง 30 นาที', ce: 1,
      price: 0, normalPrice: null, badge: null, packageIncluded: false,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-07-01', updatedAt: '2026-08-02', popularity: 9, featured: false,
      instructors: [{ id: 'INS-12', role: 'Small Animal Internal Medicine' }],
      image: { src: 'assets/img/10-guinea-pig-16x9.png', alt: 'หนูตะเภาบนพื้นหลังสีแบรนด์' },
      shortDesc: 'คอร์สฟรีแบบ Case Rounds ฝึก Problem-oriented Approach ตั้งแต่การซักประวัติ การตรวจร่างกายแบบ Checklist จนถึงการจัดทำ Problem List',
      outcomes: ['ใช้ Problem-oriented Approach ในการซักประวัติ', 'ตรวจร่างกายตาม Checklist ได้ครบถ้วน', 'จัดทำ Problem List และแผนวินิจฉัยเบื้องต้น'],
      audience: ['สัตวแพทย์จบใหม่', 'สัตวแพทย์ที่ต้องการทบทวนการทำงานแบบเป็นระบบ'],
      modules: [
        M('Systematic Approach', [L('Problem-oriented History', 'video', '18:00', { preview: true }), L('Physical Examination Checklist', 'video', '22:00')]),
        M('Case Rounds', [L('Case: สุนัขอาเจียนเรื้อรัง', 'video', '24:00'), L('Case: แมวน้ำหนักลด', 'video', '20:00'), L('Quiz — 3 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Internal Medicine Case Rounds', passPct: 80, timerMin: null,
        questions: [
          single('แนวคิด Problem-oriented Approach เริ่มต้นจากสิ่งใด', ['การรวบรวมรายการปัญหาของผู้ป่วยอย่างเป็นระบบ', 'การสั่งตรวจทุกรายการทันที', 'การเลือกยาก่อนซักประวัติ', 'การดูผลตรวจครั้งก่อนเพียงอย่างเดียว'], 0),
          multi('ข้อมูลที่ควรบันทึกในการตรวจร่างกายเบื้องต้น', ['Mucous Membrane', 'Hydration Status', 'Body Condition Score', 'สีปลอกคอ'], [0, 1, 2]),
          single('เมื่อได้ Problem List แล้ว ขั้นตอนถัดไปคือ', ['จัดลำดับความสำคัญและวางแผนวินิจฉัย', 'ปิดเคสทันที', 'ให้ยาทุกกลุ่ม', 'ลบประวัติเดิม'], 0),
          essay('เขียน Problem List และแผนวินิจฉัยเบื้องต้นของแมวที่มาด้วยน้ำหนักลด 1 เคส')
        ]
      }
    },
    {
      id: 'COURSE-010', lite: true,
      title: 'Cardiology Essentials: From Murmur to Heart Failure',
      category: 'cardiology', level: 'intermediate', language: 'en',
      durationMin: 180, durationLabel: '3 ชั่วโมง', ce: 3,
      price: 1490, normalPrice: 1790, badge: 'new', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-09-15', updatedAt: '2026-09-15', popularity: 10, featured: false,
      instructors: [{ id: 'INS-13', role: 'Veterinary Cardiology' }, { id: 'INS-14', role: 'Echocardiography' }, { id: 'INS-15', role: 'Small Animal Cardiology' }],
      image: { src: 'assets/img/02-french-bulldog-16x9.png', alt: 'สุนัขพันธุ์เฟรนช์บูลด็อกบนพื้นหลังสีแบรนด์' },
      shortDesc: 'บรรยายภาษาอังกฤษ ทบทวนการฟังเสียงหัวใจ การจัดระดับ Murmur การดูภาพรังสีทรวงอก และหลักการจัดการภาวะหัวใจล้มเหลวในสุนัขและแมว',
      outcomes: ['ฟังเสียงหัวใจและจัดระดับ Murmur อย่างเป็นระบบ', 'ใช้ภาพรังสีทรวงอกประกอบการประเมิน', 'จัด Stage ของโรคหัวใจและวางแผนการรักษา'],
      audience: ['สัตวแพทย์ที่ดูแลผู้ป่วยโรคหัวใจ', 'สัตวแพทย์ที่ต้องการฝึกฟังการบรรยายภาษาอังกฤษในหัวข้อเฉพาะทาง'],
      modules: [
        M('Cardiac Examination', [L('Auscultation Basics', 'video', '20:00', { preview: true }), L('Murmur Grading', 'video', '22:00'), L('Thoracic Radiograph Review', 'video', '24:00')]),
        M('Heart Failure Management', [L('Staging Heart Disease', 'video', '28:00'), L('Treatment Principles', 'video', '26:00'), L('Case Review', 'video', '30:00'), L('Quiz — 3 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Cardiology Essentials', passPct: 80, timerMin: null,
        questions: [
          single('การประเมินเสียง Murmur ควรทำร่วมกับข้อมูลใด', ['ประวัติ อาการ และผลตรวจอื่นประกอบ', 'สีขนของผู้ป่วย', 'ชื่อเจ้าของ', 'เวลาที่มาถึงคลินิก'], 0),
          multi('อาการที่อาจสัมพันธ์กับภาวะหัวใจล้มเหลว', ['หายใจเร็วขณะพัก', 'ไอ', 'ทนการออกกำลังกายได้ลดลง', 'ขนยาวขึ้น'], [0, 1, 2]),
          single('การจัด Stage ของโรคหัวใจช่วยเรื่องใด', ['วางแผนการรักษาและติดตามให้เหมาะสม', 'ใช้แทนการตรวจร่างกาย', 'ระบุสายพันธุ์', 'ลดค่าใช้จ่ายเสมอ'], 0),
          essay('อธิบายแนวทางสื่อสารกับเจ้าของสุนัขที่เริ่มมีภาวะหัวใจล้มเหลว เพื่อให้ติดตามอาการที่บ้านได้')
        ]
      }
    },
    {
      id: 'COURSE-011', lite: true,
      title: 'Advanced Orthopedic Examination & Fracture Management',
      category: 'orthopedics', level: 'advanced', language: 'th',
      durationMin: 420, durationLabel: '7 ชั่วโมง', ce: 7,
      price: 2890, normalPrice: 3290, badge: 'recommended', packageIncluded: false,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-05-20', updatedAt: '2026-08-12', popularity: 11, featured: true,
      instructors: [{ id: 'INS-16', role: 'Orthopedic Surgery' }, { id: 'INS-17', role: 'Veterinary Rehabilitation' }],
      image: { src: 'assets/img/07-arabian-horse-16x9.png', alt: 'ม้าพันธุ์อาหรับบนพื้นหลังสีแบรนด์' },
      shortDesc: 'คอร์สระดับสูงสำหรับการตรวจระบบกระดูกและข้อ การประเมินภาพรังสี การจำแนกและวางแผนจัดการกระดูกหัก รวมถึงการฟื้นฟูหลังผ่าตัด (ซื้อรายคอร์ส ไม่รวมในแพ็กเกจ)',
      outcomes: ['วิเคราะห์ Gait และคลำข้ออย่างเป็นระบบ', 'จำแนกกระดูกหักและเลือกหลักการยึดตรึง', 'วางแผน Rehabilitation หลังผ่าตัด'],
      audience: ['สัตวแพทย์ที่ทำศัลยกรรมกระดูก', 'สัตวแพทย์ที่ต้องการต่อยอดความรู้ด้าน Orthopedics'],
      modules: [
        M('Orthopedic Examination', [L('Gait Analysis', 'video', '30:00', { preview: true }), L('Joint Palpation', 'video', '35:00'), L('Radiographic Assessment', 'video', '40:00')]),
        M('Fracture Management', [L('Fracture Classification', 'video', '35:00'), L('Stabilization Principles', 'video', '45:00'), L('Post-operative Rehabilitation', 'video', '40:00'), L('Quiz — 3 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Orthopedic Examination & Fracture Management', passPct: 80, timerMin: null,
        questions: [
          single('การประเมิน Gait ควรทำในสภาพแวดล้อมแบบใด', ['พื้นที่ปลอดภัย สังเกตได้หลายมุมและหลายความเร็ว', 'พื้นลื่นเพื่อดูการทรงตัว', 'ขณะผู้ป่วยได้รับยาสลบ', 'ในกรงที่แคบที่สุด'], 0),
          multi('ข้อมูลที่ช่วยวางแผนจัดการกระดูกหัก', ['ตำแหน่งและรูปแบบการหัก', 'สภาพเนื้อเยื่ออ่อนรอบข้าง', 'อายุและน้ำหนักผู้ป่วย', 'สีของผ้าพันแผล'], [0, 1, 2]),
          single('เป้าหมายของ Rehabilitation หลังผ่าตัดคือ', ['ฟื้นฟูการใช้งานอย่างปลอดภัยและเป็นขั้นตอน', 'ให้ผู้ป่วยวิ่งเต็มที่ทันที', 'งดการเคลื่อนไหวตลอดชีวิต', 'ใช้แทนการติดตามผล'], 0),
          essay('วางแผนติดตามผลหลังผ่าตัดยึดกระดูกในสุนัข 1 เคส โดยระบุสิ่งที่ต้องประเมินในแต่ละช่วงเวลา')
        ]
      }
    },
    {
      id: 'COURSE-012', lite: true,
      title: 'Exotic Pet Basics: การดูแลกระต่ายและสัตว์ฟันแทะในคลินิก',
      category: 'exotic-corner', level: 'beginner', language: 'th',
      durationMin: 135, durationLabel: '2 ชั่วโมง 15 นาที', ce: 2,
      price: 890, normalPrice: 1090, badge: 'new', packageIncluded: true,
      status: 'active', sellable: true, repurchase: true,
      publishedAt: '2026-09-01', updatedAt: '2026-09-12', popularity: 12, featured: false,
      instructors: [{ id: 'INS-18', role: 'Exotic Animal Medicine' }],
      image: { src: 'assets/img/08-holland-lop-rabbit-16x9.png', alt: 'กระต่ายพันธุ์ฮอลแลนด์ลอปบนพื้นหลังสีแบรนด์' },
      shortDesc: 'พื้นฐานการจับบังคับอย่างปลอดภัย การตรวจร่างกายและตรวจฟันในกระต่ายและสัตว์ฟันแทะ พร้อมแนวทางป้องกัน GI Stasis ผ่านการให้คำแนะนำการเลี้ยง',
      outcomes: ['จับบังคับกระต่ายและสัตว์ฟันแทะอย่างปลอดภัย', 'ตรวจร่างกายและตรวจฟันได้อย่างเป็นระบบ', 'ให้คำแนะนำการเลี้ยงเพื่อป้องกันปัญหาทางเดินอาหาร'],
      audience: ['สัตวแพทย์ที่เริ่มรับเคส Exotic', 'ทีมคลินิกที่ต้องการแนวทางการจับบังคับที่ปลอดภัย'],
      modules: [
        M('Handling & Examination', [L('Safe Handling', 'video', '18:00', { preview: true }), L('Physical Examination', 'video', '24:00'), L('Dental Check', 'video', '20:00')]),
        M('Common Problems', [L('GI Stasis', 'video', '26:00'), L('Husbandry Review', 'video', '22:00'), L('Quiz — 3 Choice + 1 Essay', 'quiz')])
      ],
      quiz: {
        title: 'แบบทดสอบ: Exotic Pet Basics', passPct: 80, timerMin: null,
        questions: [
          single('การจับกระต่ายอย่างปลอดภัยควรคำนึงถึงสิ่งใดเป็นสำคัญ', ['การรองรับหลังและขาหลังเพื่อป้องกันการบาดเจ็บ', 'การจับที่หูเท่านั้น', 'การปล่อยให้กระโดดเอง', 'การจับด้วยมือเดียวเสมอ'], 0),
          multi('ปัจจัยที่เกี่ยวข้องกับ GI Stasis', ['อาหารเยื่อใยต่ำ', 'ความเครียด', 'ความเจ็บปวด', 'สีของกรง'], [0, 1, 2]),
          single('การตรวจฟันในกระต่ายสำคัญเพราะ', ['ฟันเจริญตลอดชีวิตและปัญหาฟันพบได้บ่อย', 'ฟันไม่เปลี่ยนแปลงเลย', 'ใช้ระบุเพศ', 'ไม่เกี่ยวกับการกินอาหาร'], 0),
          essay('ออกแบบคำแนะนำการเลี้ยงกระต่ายสำหรับเจ้าของมือใหม่ เพื่อป้องกันปัญหาระบบทางเดินอาหาร')
        ]
      }
    }
  ];

  /* normalise: lesson ids, question ids, derived fields */
  courses.forEach(function (c) {
    var n = c.id.slice(-3);
    c.isMock = true;
    c.levelLabel = LEVEL[c.level];
    c.languageLabel = c.language === 'en' ? 'การบรรยาย: ภาษาอังกฤษ' : 'การบรรยาย: ภาษาไทย';
    c.isFree = c.price === 0;
    c.completion = COMPLETION.slice();
    c.accessDays = 365;
    c.certificate = true;
    c.modules.forEach(function (m, mi) {
      m.id = 'C' + n + '-M' + (mi + 1);
      m.lessons.forEach(function (l, li) { l.id = m.id + '-L' + (li + 1); l.moduleId = m.id; });
    });
    c.quiz.id = 'QZ-' + n;
    c.quiz.questions.forEach(function (q, qi) { q.id = c.quiz.id + '-Q' + (qi + 1); });
    c.resources = [
      { name: 'สไลด์ประกอบการบรรยาย.pdf', size: '2.4 MB' },
      { name: 'Checklist สำหรับใช้งานในคลินิก.pdf', size: '680 KB' }
    ];
  });

  /* ---------------- Coupons ---------------- */
  var coupons = [
    { code: 'CBC300', name: 'ส่วนลดคอร์ส CBC สำหรับเวชปฏิบัติ', scope: 'course', courseId: 'COURSE-001', type: 'amount', value: 300, condition: 'ใช้ได้เฉพาะคอร์ส “การแปลผล CBC ในสุนัขและแมวสำหรับเวชปฏิบัติ”', expires: '2026-12-31' },
    { code: 'DERM15', name: 'Dermatology Starter ลด 15%', scope: 'course', courseId: 'COURSE-004', type: 'percent', value: 15, max: 200, condition: 'ใช้ได้เฉพาะคอร์ส Dermatology Essentials · ลดสูงสุด 200 บาท', expires: '2026-12-31' },
    { code: 'ANES500', name: 'ซื้อคอร์สใหม่ Anesthesia Monitoring', scope: 'course', courseId: 'COURSE-006', type: 'amount', value: 500, condition: 'ใช้ได้เฉพาะคอร์ส Anesthesia Monitoring Essentials', expires: '2026-12-31' },
    { code: 'READVPN10', name: 'ส่วนลดทั้งคำสั่งซื้อ 10%', scope: 'order', type: 'percent', value: 10, max: 500, minSubtotal: 2000, condition: 'ยอดสั่งซื้อขั้นต่ำ 2,000 บาท · ลดสูงสุด 500 บาท', expires: '2026-12-31' },
    { code: 'WELCOME200', name: 'สมาชิกใหม่ลด 200 บาท', scope: 'order', type: 'amount', value: 200, minSubtotal: 1000, condition: 'ยอดสั่งซื้อขั้นต่ำ 1,000 บาท', expires: '2026-12-31' }
  ];

  /* ---------------- Packages (ตาม Member Type) ---------------- */
  var packages = {
    vet: [
      { id: 'VET_FREE', tier: 'free', memberType: 'vet', name: 'สัตวแพทย์ FREE PLAN', price: 0, priceLabel: 'FREE', period: null, badge: null, includesCourses: false,
        features: [{ t: 'อ่านเฉพาะ Content ฟรี', ok: true }, { t: 'ไม่ดาวน์โหลดแม็กกาซีน', ok: false }, { t: 'ไม่ทำ CE', ok: false }] },
      { id: 'VET_ONLINE', tier: 'online', memberType: 'vet', name: 'อ่านเฉพาะออนไลน์', price: 1500, priceLabel: '1,500', period: 'ปี', badge: 'POPULAR', includesCourses: true, featured: true,
        features: [{ t: 'อ่านบทความ', ok: true }, { t: 'ทำข้อสอบ CE ออนไลน์', ok: true }, { t: 'ไม่ได้รับหนังสือ', ok: false }] },
      { id: 'VET_PRINT', tier: 'print', memberType: 'vet', name: 'รับหนังสือ', price: 2500, priceLabel: '2,500', period: 'ปี', badge: null, includesCourses: true,
        features: [{ t: 'รับหนังสือแบบลงทะเบียน', ok: true }, { t: 'ใช้งานออนไลน์', ok: true }] }
    ],
    student: [
      { id: 'STU_FREE', tier: 'free', memberType: 'student', name: 'นิสิต-นักศึกษา FREE PLAN', price: 0, priceLabel: 'FREE', period: null, badge: null, includesCourses: false,
        features: [{ t: 'อ่านเฉพาะส่วนที่เปิดฟรี', ok: true }, { t: 'ไม่สามารถดาวน์โหลดแม็กกาซีน', ok: false }, { t: 'ไม่สามารถทำ CE', ok: false }] },
      { id: 'STU_ONLINE', tier: 'online', memberType: 'student', name: 'นิสิต-นักศึกษา อ่านออนไลน์', price: 300, priceLabel: '300', period: 'ปี', badge: 'POPULAR', includesCourses: true, featured: true,
        features: [{ t: 'อ่านบทความและใช้งานเว็บไซต์ออนไลน์', ok: true }, { t: 'ทำข้อสอบ CE ไม่ได้', ok: false }] }
    ]
  };
  var memberTypes = { vet: 'สัตวแพทย์ (Veterinarian)', student: 'นิสิต-นักศึกษาสัตวแพทย์ (Veterinary Student)' };

  /* ---------------- Home content ---------------- */
  var heroSlides = [
    { id: 'hs1', eyebrow: 'READ VPN Learning', titleA: 'อัปเดตความรู้สัตวแพทย์', titleB: 'เรียนได้ทุกที่',
      subtitle: 'คอร์สออนไลน์สำหรับบุคลากรวิชาชีพสัตวแพทย์ เนื้อหาเชื่อมโยงกับงานคลินิกจริง พร้อมบันทึก CE และใบประกาศในระบบเดียว',
      cta: { label: 'ดูคอร์สเรียน', href: 'courses.html' }, cta2: { label: 'เกี่ยวกับเรา', href: 'about.html' },
      image: { id: 'photo-1628009368231-7bb7cfcb0def', alt: 'สัตวแพทย์อุ้มแมวลายเสือเพื่อตรวจร่างกาย', fp: '0.62,0.4' } },
    { id: 'hs2', eyebrow: 'Continue Learning', titleA: 'เรียนต่อจากจุดล่าสุด', titleB: 'ได้ทุกเวลา',
      subtitle: 'ระบบจำความคืบหน้าให้ทุกบทเรียน กลับมาเรียนต่อได้ทันทีทั้งบนคอมพิวเตอร์ แท็บเล็ต และมือถือ',
      cta: { label: 'คอร์สของฉัน', action: 'my-courses' },
      image: { id: 'photo-1515378791036-0648a3ef77b2', alt: 'ผู้เรียนใช้แล็ปท็อปเรียนออนไลน์', fp: '0.5,0.5' } },
    { id: 'hs3', eyebrow: 'Specialist Knowledge', titleA: 'ความรู้เฉพาะทางสำหรับ', titleB: 'Veterinary Practice',
      subtitle: 'คัดสรรเนื้อหาครอบคลุม 24 หมวดหมู่ ตั้งแต่ Anesthesiology, Imaging Diagnosis จนถึง Urology สำหรับสัตวแพทย์และทีมคลินิก',
      cta: { label: 'ค้นหาคอร์ส', action: 'search' },
      image: { id: 'photo-1770836037183-e0b4471fe2c0', alt: 'สัตวแพทย์ตรวจ Ultrasound ช่องท้องสุนัข', fp: '0.5,0.45' } }
  ];
  var journey = [
    { icon: 'compass', title: 'ค้นหาคอร์สที่ใช่', text: 'ค้นหาจาก 24 หมวดหมู่ กรองตามระดับ ระยะเวลา และคะแนน CE ได้ในไม่กี่คลิก' },
    { icon: 'play-circle', title: 'เรียนได้ทุกที่', text: 'วิดีโอพร้อมเอกสารประกอบ ระบบบันทึกความคืบหน้าให้อัตโนมัติทุกบทเรียน' },
    { icon: 'clipboard-check', title: 'ทดสอบความเข้าใจ', text: 'ข้อเลือกตอบทำซ้ำได้ไม่จำกัด และ Essay ที่ผู้สอนตรวจพร้อมข้อเสนอแนะ' },
    { icon: 'award', title: 'รับ CE และใบประกาศ', text: 'เมื่อครบเงื่อนไข ระบบบันทึก CE และออกใบประกาศให้ดาวน์โหลดได้ทันที' }
  ];
  var articles = [
    { id: 'ART-01', title: '5 สัญญาณเตือนโรคไตเรื้อรังในแมวที่ควรคัดกรองตั้งแต่เนิ่น ๆ', category: 'Feline Medicine', date: '2026-09-18',
      desc: 'สรุปอาการและข้อมูลที่ควรติดตามเมื่อแมวสูงวัยเริ่มดื่มน้ำมากขึ้นหรือน้ำหนักลด', image: { id: 'photo-1596272875729-ed2ff7d6d9c5', alt: 'เจ้าของอุ้มแมวลายเสือสีเทา' } },
    { id: 'ART-02', title: 'ใช้ยาปฏิชีวนะอย่างสมเหตุผล: เช็กลิสต์สำหรับคลินิกสัตว์เล็ก', category: 'Drug Corner', date: '2026-09-10',
      desc: 'แนวคิดการเลือกยา ขนาดยา และการสื่อสารกับเจ้าของสัตว์เพื่อลดปัญหาเชื้อดื้อยา', image: { id: 'photo-1770836037275-38b44e4b101f', alt: 'สัตวแพทย์ฉีดยาให้สุนัขพันธุ์เล็ก' } },
    { id: 'ART-03', title: 'Infographic: ขั้นตอนตรวจสุขภาพช่องปากสุนัขในการตรวจประจำปี', category: 'Infographic', date: '2026-08-29',
      desc: 'ภาพสรุปขั้นตอนตรวจฟันและเหงือกที่ทีมคลินิกนำไปใช้ได้ทันที', image: { id: 'photo-1770836037816-4445dbd449fd', alt: 'สัตวแพทย์ตรวจฟันสุนัข' } }
  ];
  var aboutImages = {
    who: { id: 'photo-1700665537604-412e89a285c3', alt: 'ทีมสัตวแพทย์ทำงานร่วมกันในคลินิก' },
    practice: { id: 'photo-1602052577122-f73b9710adba', alt: 'โต๊ะปฏิบัติการพร้อมกล้องจุลทรรศน์' },
    platform: { id: 'photo-1515378960530-7c0da6231fb1', alt: 'ผู้เรียนนั่งเรียนออนไลน์หน้าแล็ปท็อป' }
  };

  /* Q&A mock (ใช้กับแท็บ ถาม–ตอบ ทุกคอร์ส) */
  var qaTemplate = [
    { by: 'สพ.ญ. อรอุมา ท. (ข้อมูลจำลอง)', ago: 3, q: 'ในบทนี้ ถ้าผลตรวจที่คลินิกใช้หน่วยต่างจากในสไลด์ ควรเทียบอย่างไรคะ', answer: 'แนะนำให้ใช้ค่าอ้างอิงของเครื่องหรือห้องปฏิบัติการที่คลินิกใช้เป็นหลัก และดูแนวโน้มในผู้ป่วยรายเดิมประกอบครับ' },
    { by: 'น.สพ. ธนพล ก. (ข้อมูลจำลอง)', ago: 9, q: 'มีเอกสารสรุปให้ดาวน์โหลดสำหรับทีมผู้ช่วยไหมครับ', answer: 'ดาวน์โหลดได้ที่แท็บ “เอกสารประกอบ” ของบทเรียนครับ' }
  ];

  /* 77 จังหวัด */
  var provinces = ['กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'];

  /* รูปโปรไฟล์ของสมาชิกที่ล็อกอิน (คนเดียวกับผู้สอน INS-04) — เก็บแยกจาก profile ที่บันทึกลง localStorage */
  var memberPhoto = null;

  /* ---------------- Seeds (materialised by store.js; dates relative to today where noted) ---------------- */
  var seeds = {
    guest: { cart: ['COURSE-004'] },
    free: {
      profile: { prefix: 'สัตวแพทย์หญิง', firstName: 'พิมพ์ชนก', lastName: 'วัฒนศิริ', email: 'pimchanok.demo@example.com', phone: '', workplace: '', province: '', licenseNo: '', licenseExpiry: '', note: '', pdpa: true },
      interests: ['Internal Medicine', 'Cardiology', 'Nutrition'],
      consents: { news: true, newCourses: false, expiryAlert: true },
      tier: 'free'
    },
    paid: {
      profile: { prefix: 'สัตวแพทย์หญิง', firstName: 'พิมพ์ชนก', lastName: 'วัฒนศิริ', email: 'pimchanok.demo@example.com', phone: '08X-XXX-2456', workplace: 'คลินิกสัตวแพทย์แฮปปี้เพ็ท', province: 'กรุงเทพมหานคร', licenseNo: 'ว.12345', licenseExpiry: '2030-07-17', note: '', pdpa: true },
      interests: ['Internal Medicine', 'Cardiology', 'Nutrition'],
      consents: { news: true, newCourses: true, expiryAlert: true },
      tier: 'online',
      pkg: { startDaysAgo: 256, endInDays: 109 },
      /* entitlements: package-sourced follow package status; purchase-sourced have fixed dates */
      entitlements: {
        'COURSE-001': { source: 'package', addedAt: '2026-04-02' },
        'COURSE-002': { source: 'package', addedAt: '2026-09-10' },
        'COURSE-003': { source: 'package', addedAt: '2026-07-18' },
        'COURSE-005': { source: 'purchase', startAt: '2025-10-01', endAt: '2026-10-01', orderId: 'RV-ORD-2025-0231' },
        'COURSE-006': { source: 'purchase', startAt: '2025-08-01', endAt: '2026-08-01', orderId: 'RV-ORD-2025-0164' },
        'COURSE-007': { source: 'purchase', startAt: '2025-05-20', endAt: '2026-05-20', orderId: 'RV-ORD-2025-0087' }
      },
      /* progress: equal-weight lessons; f = fraction watched of the current lesson */
      progress: {
        'COURSE-001': { done: ['C001-M1-L1', 'C001-M1-L2', 'C001-M1-L3', 'C001-M1-L4', 'C001-M2-L1', 'C001-M2-L2', 'C001-M2-L3', 'C001-M3-L1'], partial: { lid: 'C001-M3-L2', f: 0.16 }, activityDaysAgo: 1, activityTime: '20:15' },
        'COURSE-003': { done: 'ALL', activity: '2026-08-14T09:10:00' },
        'COURSE-005': { done: ['C005-M1-L1', 'C005-M1-L2', 'C005-M1-L3', 'C005-M2-L1', 'C005-M2-L2'], partial: { lid: 'C005-M2-L3', f: 0.85 }, activity: '2026-06-20T21:05:00' },
        'COURSE-006': { done: ['C006-M1-L1', 'C006-M1-L2', 'C006-M1-L3', 'C006-M2-L1', 'C006-M2-L3', 'C006-M3-L1'], partial: { lid: 'C006-M2-L2', f: 0.20 }, activity: '2026-07-28T19:40:00' },
        'COURSE-007': { done: 'ALL', activity: '2025-08-18T10:00:00' }
      },
      choice: {
        'COURSE-003': [{ id: 'CH-P-003-1', at: '2026-07-30T10:12:00', correct: 4, total: 5, passed: true }],
        'COURSE-007': [{ id: 'CH-P-007-1', at: '2025-08-15T16:20:00', correct: 5, total: 5, passed: true }]
      },
      essays: {
        'COURSE-003': {
          attemptId: 'ATT-P-003', status: 'passed',
          versions: [
            { v: 1, at: '2026-07-30T10:20:00', text: 'ติดตามน้ำหนัก ความอยากอาหาร และผลเลือดทุก 3 เดือน พร้อมแนะนำเจ้าของให้สังเกตการดื่มน้ำและปัสสาวะที่บ้าน', file: { name: 'แผนติดตาม-CKD-แมว.pdf', size: 482133, type: 'application/pdf' } },
            { v: 2, at: '2026-08-06T19:05:00', text: 'แผนติดตาม: (1) ทุก 1–3 เดือนตาม Stage ตรวจ Creatinine/SDMA, USG, ความดันโลหิต และน้ำหนักตัว/BCS (2) ประเมิน Appetite และ Hydration ทุกครั้ง (3) สื่อสารกับเจ้าของด้วย Checklist การสังเกตอาการที่บ้าน เช่น ปริมาณน้ำที่ดื่ม ความอยากอาหาร อาเจียน และนัดหมายครั้งถัดไปอย่างชัดเจน', file: { name: 'แผนติดตาม-CKD-แมว-v2.pdf', size: 506880, type: 'application/pdf' } }
          ],
          reviews: [
            { v: 1, at: '2026-08-02T14:30:00', by: 'รศ. สพ.ญ. ดร. นลินี ศรีสุข', result: 'fail', comment: 'ขอให้ระบุความถี่ในการติดตามค่า Creatinine/SDMA ความดันโลหิต และน้ำหนักตัวให้ชัดเจนตาม Stage พร้อมยกตัวอย่างการสื่อสารกับเจ้าของเรื่องการสังเกตอาการที่บ้าน', file: { name: 'แนวทางปรับปรุงคำตอบ.pdf', size: 215040, type: 'application/pdf' } },
            { v: 2, at: '2026-08-14T09:10:00', by: 'รศ. สพ.ญ. ดร. นลินี ศรีสุข', result: 'pass', comment: 'คำตอบครบถ้วน มีแผนติดตามที่ชัดเจนและนำไปใช้กับงานคลินิกได้จริง', file: null }
          ]
        },
        'COURSE-007': {
          attemptId: 'ATT-P-007', status: 'passed',
          versions: [{ v: 1, at: '2025-08-15T16:30:00', text: 'ก่อนเดินทาง: แนะนำให้เจ้าของฝึกให้แมวคุ้นกับ Carrier และคลุมผ้า ห้องรอ: แยกโซนแมว วาง Carrier บนที่สูง ห้องตรวจ: ลดเสียง ใช้ผ้าขนหนู และให้แมวอยู่ในท่าที่สบาย จบการตรวจ: สรุปคำแนะนำและนัดหมายครั้งถัดไป', file: null }],
          reviews: [{ v: 1, at: '2025-08-18T10:00:00', by: 'สพ.ญ. ดร. สิริกานต์ อภิรักษ์', result: 'pass', comment: 'ครอบคลุมทุกช่วงของ Journey และนำไปใช้ได้จริง', file: null }]
        }
      },
      certificates: [
        { id: 'CERT-RV-26-00318', cid: 'COURSE-003', issuedAt: '2026-08-14' },
        { id: 'CERT-RV-25-00207', cid: 'COURSE-007', issuedAt: '2025-08-18' }
      ],
      ce: [
        { origin: 'course', cid: 'COURSE-003', title: 'แนวทางดูแลแมวโรคไตเรื้อรังในคลินิก', points: 5, date: '2026-08-14' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 7/2569', points: 5, date: '2026-07-18' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 5/2569', points: 4, date: '2026-05-20' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 3/2569', points: 4, date: '2026-03-15' },
        { origin: 'course', cid: 'COURSE-007', title: 'Feline Behavior: ลดความเครียดของแมวในคลินิก', points: 2, date: '2025-08-18' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 9/2568', points: 4, date: '2025-09-20' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 6/2568', points: 5, date: '2025-06-18' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 2/2568', points: 4, date: '2025-02-16' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 8/2567', points: 5, date: '2024-08-17' },
        { origin: 'other', title: 'แบบทดสอบ CE วารสาร VPN ฉบับที่ 4/2567', points: 4, date: '2024-04-20' }
      ],
      orders: [
        { id: 'RV-ORD-2026-0019', at: '2026-02-14T13:22:00', items: [{ cid: 'COURSE-012', price: 890, normal: 1090, coupon: null, disc: 0, net: 890 }], subtotal: 890, courseDisc: 0, orderDisc: 0, orderCoupon: null, net: 890, method: 'card', status: 'failed', receipt: { want: false } },
        { id: 'RV-ORD-2026-0004', at: '2026-01-08T10:05:00', items: [{ cid: 'COURSE-011', price: 2890, normal: 3290, coupon: null, disc: 0, net: 2890 }], subtotal: 2890, courseDisc: 0, orderDisc: 0, orderCoupon: null, net: 2890, method: 'qr', status: 'cancelled', receipt: { want: false } },
        { id: 'RV-ORD-2025-0231', at: '2025-10-01T20:15:00', items: [{ cid: 'COURSE-005', price: 2490, normal: null, coupon: null, disc: 0, net: 2490 }], subtotal: 2490, courseDisc: 0, orderDisc: 0, orderCoupon: null, net: 2490, method: 'qr', status: 'paid', receipt: { want: false } },
        { id: 'RV-ORD-2025-0164', at: '2025-08-01T09:40:00', items: [{ cid: 'COURSE-006', price: 1790, normal: 2090, coupon: null, disc: 0, net: 1790 }], subtotal: 1790, courseDisc: 0, orderDisc: 0, orderCoupon: null, net: 1790, method: 'qr', status: 'paid', receipt: { want: true, type: 'corporate', name: 'บริษัท แฮปปี้เพ็ท แอนิมอล แคร์ จำกัด', status: 'issued' } },
        { id: 'RV-ORD-2025-0087', at: '2025-05-20T11:02:00', items: [{ cid: 'COURSE-007', price: 1190, normal: 1390, coupon: null, disc: 0, net: 1190 }], subtotal: 1190, courseDisc: 0, orderDisc: 0, orderCoupon: null, net: 1190, method: 'card', status: 'paid', receipt: { want: true, type: 'individual', name: 'พิมพ์ชนก วัฒนศิริ', status: 'issued' } }
      ],
      notifications: [
        { id: 'N-P-01', type: 'certificate', title: 'ใบประกาศพร้อมดาวน์โหลด', desc: 'แนวทางดูแลแมวโรคไตเรื้อรังในคลินิก', at: '2026-08-14T09:15:00', read: false, cta: { label: 'ดูใบประกาศ', href: 'certificate.html?id=CERT-RV-26-00318' } },
        { id: 'N-P-02', type: 'ce', title: 'CE พร้อมบันทึก 5 หน่วย', desc: 'บันทึก CE จากคอร์ส แนวทางดูแลแมวโรคไตเรื้อรังในคลินิก แล้ว', at: '2026-08-14T09:15:00', read: false, cta: { label: 'ดู CE', href: 'account-certificates.html' } },
        { id: 'N-P-03', type: 'essay-pass', title: 'Essay ผ่านการตรวจ', desc: 'ผู้สอนตรวจคำตอบของคุณในคอร์ส แนวทางดูแลแมวโรคไตเรื้อรังในคลินิก แล้ว', at: '2026-08-14T09:10:00', read: true, cta: { label: 'ดูผลการเรียน', href: 'result.html?id=COURSE-003' } },
        { id: 'N-P-04', type: 'essay-revision', title: 'Essay ต้องแก้ไข', desc: 'ผู้สอนส่งความคิดเห็นกลับมาให้ปรับปรุงคำตอบ', at: '2026-08-02T14:30:00', read: true, cta: { label: 'ดูความคิดเห็น', href: 'result.html?id=COURSE-003' } },
        { id: 'N-P-05', type: 'expiry', title: 'สิทธิ์เรียนหมดอายุแล้ว', desc: 'Anesthesia Monitoring Essentials — ซื้อคอร์สใหม่เพื่อเรียนต่อจากจุดเดิม', at: '2026-08-01T00:05:00', read: true, cta: { label: 'ซื้อคอร์สใหม่', href: 'course.html?id=COURSE-006' } },
        { id: 'N-P-06', type: 'purchase', title: 'ซื้อคอร์สสำเร็จ', desc: 'พื้นฐาน Ultrasound ช่องท้องสำหรับสัตวแพทย์', at: '2025-10-01T20:16:00', read: true, cta: { label: 'ดูประวัติการสั่งซื้อ', href: 'account-orders.html' } }
      ]
    },
    devices: [
      { id: 'dev-1', name: 'MacBook Pro · Chrome', icon: 'monitor', location: 'กรุงเทพมหานคร', last: 'ใช้งานอยู่ขณะนี้', current: true },
      { id: 'dev-2', name: 'iPhone · Safari', icon: 'smartphone', location: 'กรุงเทพมหานคร', last: 'เมื่อวาน 21:14 น.' },
      { id: 'dev-3', name: 'iPad · Safari', icon: 'tablet', location: 'นนทบุรี', last: '12 ก.ย. 2569' }
    ]
  };

  RV.data = {
    note: 'ข้อมูลทั้งหมดเป็นข้อมูลจำลองสำหรับ Prototype',
    categories: categories,
    interests: interests,
    instructors: instructors,
    courses: courses,
    coupons: coupons,
    packages: packages,
    memberTypes: memberTypes,
    heroSlides: heroSlides,
    journey: journey,
    articles: articles,
    aboutImages: aboutImages,
    qaTemplate: qaTemplate,
    provinces: provinces,
    levels: LEVEL,
    memberPhoto: memberPhoto,
    seeds: seeds
  };
})();
