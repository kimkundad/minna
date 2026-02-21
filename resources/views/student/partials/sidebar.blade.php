<div class="student-side-nav">
    <h4>ข้อมูลโปรไฟล์</h4>

    <a href="{{ route('student.index') }}" class="side-link {{ $active === 'profile' ? 'active' : '' }}">
        <i class="icofont-user"></i>
        <span>โปรไฟล์ของฉัน</span>
    </a>

    <a href="{{ route('student.courses') }}" class="side-link {{ $active === 'courses' ? 'active' : '' }}">
        <i class="icofont-read-book"></i>
        <span>คอร์สเรียนของฉัน</span>
    </a>

    <a href="{{ route('student.password.edit') }}" class="side-link {{ $active === 'password' ? 'active' : '' }}">
        <i class="icofont-lock"></i>
        <span>เปลี่ยนรหัสผ่าน</span>
    </a>

    <form method="POST" action="{{ route('logout') }}" class="m-0">
        @csrf
        <button type="submit" class="side-link side-link-btn">
            <i class="icofont-logout"></i>
            <span>ออกจากระบบ</span>
        </button>
    </form>
</div>
