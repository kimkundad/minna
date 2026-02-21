<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class StudentController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));

        $students = User::role('student')
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhere('phone', 'like', "%{$q}%");
                });
            })
            ->latest()
            ->paginate(10)
            ->withQueryString();

        return view('admin.students.index', compact('students', 'q'));
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

