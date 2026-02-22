<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Testimonial;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class TestimonialController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $status = trim((string) $request->query('status', ''));

        $testimonials = Testimonial::query()
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('name', 'like', "%{$q}%")
                        ->orWhere('designation', 'like', "%{$q}%")
                        ->orWhere('content', 'like', "%{$q}%");
                });
            })
            ->when($status !== '', fn ($query) => $query->where('status', $status))
            ->orderBy('sort_order')
            ->latest('id')
            ->paginate(15)
            ->withQueryString();

        return view('admin.testimonials.index', compact('testimonials', 'q', 'status'));
    }

    public function create()
    {
        return view('admin.testimonials.create');
    }

    public function store(Request $request)
    {
        $validated = $this->validateInput($request);
        $validated['created_by'] = $request->user()->id;
        $validated['updated_by'] = $request->user()->id;

        if ($request->hasFile('avatar')) {
            $validated['avatar_path'] = $request->file('avatar')->store('testimonials/avatars', 'spaces');
        }

        Testimonial::create($validated);

        return redirect()->route('admin.testimonials.index')->with('success', 'สร้างเสียงตอบรับเรียบร้อยแล้ว');
    }

    public function edit(Testimonial $testimonial)
    {
        return view('admin.testimonials.edit', compact('testimonial'));
    }

    public function update(Request $request, Testimonial $testimonial)
    {
        $validated = $this->validateInput($request);
        $validated['updated_by'] = $request->user()->id;

        if ($request->hasFile('avatar')) {
            if ($testimonial->avatar_path) {
                Storage::disk('spaces')->delete($testimonial->avatar_path);
            }
            $validated['avatar_path'] = $request->file('avatar')->store('testimonials/avatars', 'spaces');
        }

        $testimonial->update($validated);

        return redirect()->route('admin.testimonials.index')->with('success', 'แก้ไขเสียงตอบรับเรียบร้อยแล้ว');
    }

    private function validateInput(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'designation' => ['nullable', 'string', 'max:255'],
            'content' => ['required', 'string', 'max:2000'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['required', Rule::in(['draft', 'published'])],
            'avatar' => ['nullable', 'image', 'max:5120'],
        ]);
    }
}

