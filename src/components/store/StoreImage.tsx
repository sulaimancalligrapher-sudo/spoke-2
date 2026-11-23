import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { resolveStoreImageUrl } from '../../utils/storeSheets';

interface StoreImageProps {
  src?: string;
  alt: string;
  aspectClass?: string;
  className?: string;
}

export const StoreImage: React.FC<StoreImageProps> = ({
  src,
  alt,
  aspectClass = 'aspect-[4/3]',
  className = 'w-full h-full object-cover',
}) => {
  const resolved = resolveStoreImageUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${aspectClass}`}>
      {!failed && resolved ? (
        <img
          src={resolved}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className={className}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-400">
          <ImageIcon className="w-8 h-8" />
        </div>
      )}
    </div>
  );
};
