<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CourseCategory;
use Illuminate\Http\Request;

class CourseCategoryController extends Controller
{
    public function index()
    {
        $categories = CourseCategory::query()->latest()->paginate(20);

        return view('admin.categories.index', compact('categories'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:course_categories,name',
        ]);

        CourseCategory::create($validated);

        return redirect()->route('admin.categories.index')->with('success', 'สร้างหมวดหมู่คอร์สเรียบร้อยแล้ว');
    }

    public function edit(CourseCategory $category)
    {
        return view('admin.categories.edit', compact('category'));
    }

    public function update(Request $request, CourseCategory $category)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:course_categories,name,'.$category->id,
        ]);

        $category->update($validated);

        return redirect()->route('admin.categories.index')->with('success', 'แก้ไขหมวดหมู่คอร์สเรียบร้อยแล้ว');
    }

    public function destroy(CourseCategory $category)
    {
        $category->delete();

        return redirect()->route('admin.categories.index')->with('success', 'ลบหมวดหมู่คอร์สเรียบร้อยแล้ว');
    }
}
