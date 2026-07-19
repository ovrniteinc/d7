import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Modal } from "./ui";
import { getCroppedImage } from "../lib/crop-image";

interface AvatarCropModalProps {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

export default function AvatarCropModal({ open, imageSrc, onClose, onConfirm }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const apply = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const cropped = await getCroppedImage(imageSrc, croppedAreaPixels);
      onConfirm(cropped);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!imageSrc) return null;

  return (
    <Modal open={open} onClose={onClose} title="Adjust profile photo">
      <p className="text-sm text-white/55 mb-4">Drag to reposition and use the slider to zoom. Your photo will appear as a circle.</p>

      <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-black/50">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="mt-5">
        <label className="label">Zoom</label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-white"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={apply} disabled={saving || !croppedAreaPixels}>
          {saving ? "Applying…" : "Use photo"}
        </button>
      </div>
    </Modal>
  );
}
