import { useState } from 'react';
import {
  CollapsibleFormSection,
  FormSection,
  FormSubsection,
  LONG_FIELD,
  SHORT_FIELD,
  TextField,
} from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Mẫu khuôn cho form: khu, thẻ chứa ô, mục con thụt một bậc. */
export function FormSectionDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 space-y-4">
      <FormSection title="Thông tin liên hệ mẫu">
        {['Kênh', 'Khung giờ', 'Vai trò', 'Số điện thoại'].map((label) => (
          <div key={label} className={SHORT_FIELD}>
            <TextField label={label} placeholder="Nhập thông tin" />
          </div>
        ))}
        <div className={LONG_FIELD}>
          <TextField label="Ghi chú liên hệ mẫu" placeholder="Nội dung dài chiếm cả hàng" />
        </div>
      </FormSection>
      <CollapsibleFormSection title="Nâng cao" open={open} onOpenChange={setOpen} aria-label="Khuôn nâng cao mẫu">
        <FormSubsection title="Nhu cầu mẫu">
          {['Ngân sách', 'Thời điểm', 'Loại căn', 'Mục đích'].map((label) => (
            <div key={label} className={SHORT_FIELD}>
              <TextField label={`${label} mẫu`} placeholder="Nhập thông tin" />
            </div>
          ))}
          <label
            htmlFor="form-section-demo-condition"
            className={`${LONG_FIELD} flex flex-col gap-1.5 text-label text-ink-muted`}
          >
            Điều kiện mẫu
            <Textarea id="form-section-demo-condition" placeholder="Nội dung nhiều dòng chiếm cả hàng" />
          </label>
          <div className={`${LONG_FIELD} flex justify-start`}>
            <Button>Thêm đợt</Button>
          </div>
        </FormSubsection>
      </CollapsibleFormSection>
    </div>
  );
}
