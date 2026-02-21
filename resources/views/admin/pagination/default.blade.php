<ul class="pagination">
    <li class="page-item previous disabled"><a href="{{ $paginator->url(1) }}" class="page-link"><i class="previous"></i></a></li>
    @for ($i = 1; $i <= $paginator->lastPage(); $i++)
    <li class="page-item {{ ($paginator->currentPage() == $i) ? ' active' : '' }}"><a href="{{ $paginator->url($i) }}" class="page-link">{{ $i }}</a></li>
    @endfor
    <li class="page-item next"><a href="{{ $paginator->url($paginator->currentPage()+1) }}"  class="page-link"><i class="next"></i></a></li>
</ul>