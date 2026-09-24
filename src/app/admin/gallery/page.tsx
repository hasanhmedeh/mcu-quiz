import { isAdminAuthenticated, isAdminConfigured } from '@/lib/auth/session';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { GalleryBrowser } from '@/components/admin/GalleryBrowser';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Captures — MCU Endgame Preparation Quiz',
  robots: { index: false, follow: false },
};

/** Every proctoring image, for the organiser only. */
export default async function AdminGalleryPage() {
  if (!(await isAdminAuthenticated())) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }
  return <GalleryBrowser />;
}
