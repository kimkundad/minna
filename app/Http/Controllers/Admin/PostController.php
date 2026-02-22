<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PostController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $status = trim((string) $request->query('status', ''));

        $posts = Post::query()
            ->with('author')
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('title', 'like', "%{$q}%")
                        ->orWhere('excerpt', 'like', "%{$q}%");
                });
            })
            ->when($status !== '', fn ($query) => $query->where('status', $status))
            ->latest()
            ->paginate(15)
            ->withQueryString();

        return view('admin.posts.index', compact('posts', 'q', 'status'));
    }

    public function create()
    {
        return view('admin.posts.create');
    }

    public function store(Request $request)
    {
        $validated = $this->validatePost($request);

        $validated['slug'] = $this->makeUniqueSlug($validated['title']);
        $validated['created_by'] = $request->user()->id;
        $validated['updated_by'] = $request->user()->id;
        $validated['published_at'] = $validated['status'] === 'published'
            ? ($validated['published_at'] ?? now())
            : null;

        if ($request->hasFile('cover_image')) {
            $validated['cover_path'] = $request->file('cover_image')->store('posts/covers', 'spaces');
        }

        Post::create($validated);

        return redirect()->route('admin.posts.index')->with('success', 'สร้างบทความเรียบร้อยแล้ว');
    }

    public function edit(Post $post)
    {
        return view('admin.posts.edit', compact('post'));
    }

    public function update(Request $request, Post $post)
    {
        $validated = $this->validatePost($request);

        $validated['slug'] = $this->makeUniqueSlug($validated['title'], $post->id);
        $validated['updated_by'] = $request->user()->id;
        $validated['published_at'] = $validated['status'] === 'published'
            ? ($validated['published_at'] ?? ($post->published_at ?? now()))
            : null;

        if ($request->hasFile('cover_image')) {
            if ($post->cover_path) {
                Storage::disk('spaces')->delete($post->cover_path);
            }
            $validated['cover_path'] = $request->file('cover_image')->store('posts/covers', 'spaces');
        }

        $post->update($validated);

        return redirect()->route('admin.posts.index')->with('success', 'แก้ไขบทความเรียบร้อยแล้ว');
    }

    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'image', 'max:10240'],
        ]);

        $path = $request->file('image')->store('posts/content-images', 'spaces');
        $url = Storage::disk('spaces')->url($path);

        return response()->json([
            'url' => $url,
        ]);
    }

    private function validatePost(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'excerpt' => ['nullable', 'string', 'max:500'],
            'content_html' => ['required', 'string'],
            'status' => ['required', Rule::in(['draft', 'published'])],
            'published_at' => ['nullable', 'date'],
            'cover_image' => ['nullable', 'image', 'max:10240'],
        ]);
    }

    private function makeUniqueSlug(string $title, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($title);
        if ($baseSlug === '') {
            $baseSlug = Str::lower(Str::random(8));
        }

        $slug = $baseSlug;
        $counter = 2;

        while (Post::query()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->where('slug', $slug)
            ->exists()
        ) {
            $slug = $baseSlug . '-' . $counter;
            $counter++;
        }

        return $slug;
    }
}
