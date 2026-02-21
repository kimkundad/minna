<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;

class StudentController extends Controller
{
    //
    public function index()
    {
        // ดึงเฉพาะผู้ใช้ที่มี role "student"
        $students = User::role('student')->paginate(10);

        return view('admin.students.index', compact('students'));
    }

    public function edit($id)
    {
        $student = User::findOrFail($id);
        return view('admin.students.edit', compact('student'));
    }

    public function destroy($id)
    {
        $student = User::findOrFail($id);
        $student->delete();

        return redirect()->route('admin.students.index')->with('success', 'ลบข้อมูลนักเรียนเรียบร้อยแล้ว');
    }
}
