import { GooeyToaster, gooeyToast, type GooeyToasterProps } from "goey-toast";
import "goey-toast/styles.css";

export const Toaster = (props: GooeyToasterProps) => {
  return <GooeyToaster showTimestamp={false} {...props} />;
};

const wrap = (fn: any) => (title: string, options?: any) => {
  return fn(title, { showTimestamp: false, ...options });
};

export const toast = Object.assign(wrap(gooeyToast), {
  success: wrap(gooeyToast.success),
  error: wrap(gooeyToast.error),
  warning: wrap(gooeyToast.warning),
  info: wrap(gooeyToast.info),
  promise: gooeyToast.promise,
  dismiss: gooeyToast.dismiss,
  update: (id: string | number, options: any) =>
    gooeyToast.update(id, { showTimestamp: false, ...options }),
});

export { toast as gooeyToast, toast as goeyToast, GooeyToaster as GoeyToaster };
