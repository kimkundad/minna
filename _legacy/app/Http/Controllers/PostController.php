<?php

namespace App\Http\Controllers;

use App\Models\Post;

class PostController extends Controller
{
    public function index()
    {
        $posts = Post::query()
            ->published()
            ->with('author')
            ->latest('published_at')
            ->paginate(9);

        return view('posts.index', compact('posts'));
    }

    public function show(Post $post)
    {
        abort_unless(
            $post->status === 'published' && $post->published_at !== null && $post->published_at->lte(now()),
            404
        );

        return view('posts.show', compact('post'));
    }
}
