<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Subject;
use Illuminate\Http\Request;

class SubjectController extends Controller
{
    public function index()
    {
        $subjects = Subject::query()->latest()->paginate(20);

        return view('admin.subjects.index', compact('subjects'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:subjects,name',
        ]);

        Subject::create($validated);

        return redirect()->route('admin.subjects.index')->with('success', 'สร้างชื่อวิชาเรียบร้อยแล้ว');
    }

    public function edit(Subject $subject)
    {
        return view('admin.subjects.edit', compact('subject'));
    }

    public function update(Request $request, Subject $subject)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:subjects,name,'.$subject->id,
        ]);

        $subject->update($validated);

        return redirect()->route('admin.subjects.index')->with('success', 'แก้ไขชื่อวิชาเรียบร้อยแล้ว');
    }

    public function destroy(Subject $subject)
    {
        $subject->delete();

        return redirect()->route('admin.subjects.index')->with('success', 'ลบชื่อวิชาเรียบร้อยแล้ว');
    }
}
