use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ForegroundPresentation {
    Clear,
    FullScreen,
    Unknown,
}

#[derive(Clone, Copy, Debug)]
struct Bounds {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl Bounds {
    fn is_valid(self) -> bool {
        self.right > self.left && self.bottom > self.top
    }
}

fn covers_monitor(window: Bounds, monitor: Bounds) -> Option<bool> {
    if !window.is_valid() || !monitor.is_valid() {
        return None;
    }
    const EDGE_TOLERANCE_PX: i32 = 4;
    Some(
        window.left <= monitor.left.saturating_add(EDGE_TOLERANCE_PX)
            && window.top <= monitor.top.saturating_add(EDGE_TOLERANCE_PX)
            && window.right >= monitor.right.saturating_sub(EDGE_TOLERANCE_PX)
            && window.bottom >= monitor.bottom.saturating_sub(EDGE_TOLERANCE_PX),
    )
}

#[cfg(target_os = "windows")]
pub(crate) fn foreground_presentation() -> ForegroundPresentation {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetShellWindow, GetWindowRect, IsIconic,
            IsWindowVisible,
        },
    };

    fn bounds(rect: RECT) -> Bounds {
        Bounds {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        }
    }

    // The launch window is still hidden. A failed foreground/monitor query must
    // not be treated as permission to interrupt another app during autostart.
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.is_null() {
            return ForegroundPresentation::Unknown;
        }
        if foreground == GetShellWindow() {
            return ForegroundPresentation::Clear;
        }
        if IsWindowVisible(foreground) == 0 {
            return ForegroundPresentation::Unknown;
        }
        if IsIconic(foreground) != 0 {
            return ForegroundPresentation::Clear;
        }

        let mut class_name = [0u16; 64];
        let class_len = GetClassNameW(foreground, class_name.as_mut_ptr(), class_name.len() as i32);
        if class_len == 0 {
            return ForegroundPresentation::Unknown;
        }
        let class_name = String::from_utf16_lossy(&class_name[..class_len as usize]);
        if matches!(class_name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
            return ForegroundPresentation::Clear;
        }

        let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return ForegroundPresentation::Unknown;
        }
        let mut monitor_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..MONITORINFO::default()
        };
        if GetMonitorInfoW(monitor, &mut monitor_info) == 0 {
            return ForegroundPresentation::Unknown;
        }
        let mut window_rect = RECT::default();
        if GetWindowRect(foreground, &mut window_rect) == 0 {
            return ForegroundPresentation::Unknown;
        }
        match covers_monitor(bounds(window_rect), bounds(monitor_info.rcMonitor)) {
            Some(true) => ForegroundPresentation::FullScreen,
            Some(false) => ForegroundPresentation::Clear,
            None => ForegroundPresentation::Unknown,
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn foreground_presentation() -> ForegroundPresentation {
    ForegroundPresentation::Unknown
}

#[cfg(test)]
mod tests {
    use super::{covers_monitor, Bounds, ForegroundPresentation};

    #[test]
    fn frontend_bridge_uses_expected_foreground_state_values() {
        assert_eq!(
            serde_json::to_string(&ForegroundPresentation::FullScreen).unwrap(),
            "\"full-screen\""
        );
        assert_eq!(
            serde_json::to_string(&ForegroundPresentation::Unknown).unwrap(),
            "\"unknown\""
        );
    }

    #[test]
    fn full_monitor_covering_is_detected_on_secondary_negative_coordinates() {
        let monitor = Bounds {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1080,
        };
        assert_eq!(covers_monitor(monitor, monitor), Some(true));
        assert_eq!(
            covers_monitor(
                Bounds {
                    left: -1918,
                    top: 2,
                    right: -2,
                    bottom: 1078,
                },
                monitor,
            ),
            Some(true)
        );
    }

    #[test]
    fn ordinary_maximized_window_with_visible_taskbar_is_not_full_screen() {
        let monitor = Bounds {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let work_area_window = Bounds {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1032,
        };
        assert_eq!(covers_monitor(work_area_window, monitor), Some(false));
    }

    #[test]
    fn bad_geometry_is_unknown_not_clear() {
        let bad = Bounds {
            left: 0,
            top: 0,
            right: 0,
            bottom: 1080,
        };
        assert_eq!(covers_monitor(bad, bad), None);
    }
}
