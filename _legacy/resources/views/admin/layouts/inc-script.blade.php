

<script>
var defaultThemeMode = "dark";
var themeMode;
if ( document.documentElement )
{
    if ( document.documentElement.hasAttribute("data-theme-mode"))
    {
        themeMode = document.documentElement.getAttribute("data-theme-mode");
    } else {

        if ( localStorage.getItem("data-theme") !== null ) { themeMode = localStorage.getItem("data-theme");
        } else {
            themeMode = defaultThemeMode;
        }

    } if (themeMode === "system") {
        themeMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "dark";
    }
    document.documentElement.setAttribute("data-theme", themeMode);
}
            </script>

<!--begin::Javascript-->
<script>var hostUrl = "assets/";</script>
<!--begin::Global Javascript Bundle(mandatory for all pages)-->
<script src="{{ url('admin/assets/plugins/global/plugins.bundle.js') }}"></script>
<script src="{{ url('admin/assets/js/scripts.bundle.js') }}"></script>
<!--end::Global Javascript Bundle-->
<!--begin::Vendors Javascript(used for this page only)-->
<script src="{{ url('admin/assets/plugins/custom/datatables/datatables.bundle.js') }}"></script>
<!--end::Vendors Javascript-->
<!--begin::Custom Javascript(used for this page only)-->
<script src="{{ url('admin/assets/js/custom/apps/file-manager/list.js') }}"></script>
<script src="{{ url('admin/assets/js/widgets.bundle.js') }}"></script>
<script src="{{ url('admin/assets/js/custom/widgets.js') }}"></script>
<script src="{{ url('admin/assets/js/custom/apps/chat/chat.js') }}"></script>
<script src="{{ url('admin/assets/js/custom/utilities/modals/upgrade-plan.js') }}"></script>
<script src="{{ url('admin/assets/js/custom/utilities/modals/create-app.js') }}"></script>
<script src="{{ url('admin/assets/js/custom/utilities/modals/users-search.js') }}"></script>
<script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>

<script>
    @if ($message = Session::get('add_success'))
    Swal.fire({
        text: "ระบบได้ทำการอัพเดทข้อมูลสำเร็จ!",
        icon: "success",
        buttonsStyling: false,
        confirmButtonText: "Ok, got it!",
        customClass: {
            confirmButton: "btn btn-primary"
        }
    });
    @endif

    @if ($message = Session::get('edit_success'))
    Swal.fire({
        text: "ระบบได้ทำการอัพเดทข้อมูลสำเร็จ!",
        icon: "success",
        buttonsStyling: false,
        confirmButtonText: "Ok, got it!",
        customClass: {
            confirmButton: "btn btn-primary"
        }
    });
    @endif

    @if ($message = Session::get('del_success'))
    Swal.fire({
        text: "ระบบได้ทำการลบข้อมูลสำเร็จ!",
        icon: "success",
        buttonsStyling: false,
        confirmButtonText: "Ok, got it!",
        customClass: {
            confirmButton: "btn btn-primary"
        }
    });
    @endif

    @if ($message = Session::get('edit_error'))
    Swal.fire({
        text: "ไม่สามารถลบรายการนี้ได้!",
        icon: "error",
        buttonsStyling: false,
        confirmButtonText: "Ok, got it!",
        customClass: {
            confirmButton: "btn btn-primary"
        }
    });
    @endif



</script>
<!--end::Custom Javascript-->
<!--end::Javascript-->
